import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import type { Lang } from '../../../shared/i18n';
import { authedFetch } from '../../auth/api/headers';
import type { Mood, StoryIntent, StoryStage, TurnResult } from '../types';

/**
 * POST /api/v1/prayers/stories/:story/turn (saju_server Prayers::StoryTurn) — free.
 *   {stage, message, history: [{role: user|cat|narrator, text}], cat_name, lang}
 *   → {lines: [{kind: action|say, text}], intent, name, mood, suggestions}
 * 429 DAILY_LIMIT · 422 MESSAGE_INVALID · 503 LLM_UNAVAILABLE.
 */
export type TurnError = 'offline' | 'limit' | 'failed';

const INTENTS: StoryIntent[] = ['none', 'stay', 'refuse', 'invite', 'name'];
const MOODS: Mood[] = ['idle', 'smug', 'unimpressed', 'curious', 'quiet', 'pleased'];

export function mapTurn(b: any): TurnResult | null {
  const lines = Array.isArray(b?.lines)
    ? b.lines
      .filter((l: any) => typeof l?.text === 'string' && l.text.trim())
      .map((l: any) => ({ kind: l.kind === 'action' ? 'action' as const : 'say' as const, text: String(l.text).trim() }))
    : [];
  if (!lines.some((l: { kind: string }) => l.kind === 'say')) return null;
  return {
    lines,
    intent: INTENTS.includes(b.intent) ? b.intent : 'none',
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : null,
    mood: MOODS.includes(b.mood) ? b.mood : 'idle',
    suggestions: Array.isArray(b.suggestions) ? b.suggestions.filter((x: unknown) => typeof x === 'string' && x).slice(0, 3) : [],
  };
}

export async function storyTurn(req: {
  story: string;
  stage: StoryStage;
  message: string;
  history: { role: string; text: string }[];
  catName: string | null;
  lang: Lang;
  signal?: AbortSignal;
}): Promise<TurnResult | { error: TurnError }> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/stories/${req.story}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: req.stage,
        message: req.message,
        history: req.history,
        cat_name: req.catName ?? undefined,
        lang: req.lang,
      }),
      signal: req.signal,
    });
    if (!res) return { error: 'offline' };
    if (res.status === 429) return { error: 'limit' };
    const b = await res.json().catch(() => null);
    const turn = res.ok && b?.success ? mapTurn(b) : null;
    if (!turn) {
      devlog(`[story] turn refused: HTTP ${res.status} ${b?.error ?? ''}`);
      return { error: 'failed' };
    }
    return turn;
  } catch (e) {
    devlog(`[story] turn failed: ${String(e)}`);
    return { error: 'offline' };
  }
}
