/**
 * The engine's view of Unity: staging commands out, nothing else.
 *
 * Deliberately thin. `ConsultationEngine` must stay testable without a renderer
 * or a native module, so it never touches `unityBridge` directly — it takes a
 * `StagePort`, and this is the one that speaks to the real player.
 */
import type { StagePort } from '../flow/engine';
import type { ChatMode, OracleAskPayload, StagePhasePayload, UnityBridge } from '../types';

export function createStagePort(bridge: UnityBridge, onExit: () => void): StagePort {
  return {
    phase(payload: StagePhasePayload) {
      bridge.sendEvent({ type: 'STAGE_PHASE', payload });
    },
    thinking(on: boolean) {
      bridge.sendEvent({ type: 'STAGE_THINKING', payload: { on } });
    },
    speakClip(locKeys: string[], topic: string, cacheKey: string, texts?: string[]) {
      bridge.sendEvent({
        type: 'STAGE_SPEAK',
        payload: { mode: 'clip', locKeys, topic, cacheKey, texts },
      });
    },
    speakText(text: string, cacheKey: string) {
      bridge.sendEvent({ type: 'STAGE_SPEAK', payload: { mode: 'tts', text, cacheKey } });
    },
    prefetchText(text: string, cacheKey: string) {
      bridge.sendEvent({ type: 'STAGE_SPEAK', payload: { mode: 'tts', text, cacheKey, prefetch: true } });
    },
    stopSpeak() {
      bridge.sendEvent({ type: 'STAGE_STOP_SPEAK' });
    },
    askOracle(payload: OracleAskPayload) {
      bridge.sendEvent({ type: 'ORACLE_ASK', payload });
    },
    startMic(lang: string) {
      bridge.sendEvent({ type: 'MIC_START', payload: { lang } });
    },
    stopMic() {
      bridge.sendEvent({ type: 'MIC_STOP' });
    },
    cancelMic() {
      bridge.sendEvent({ type: 'MIC_CANCEL' });
    },
    exit: onExit,
  };
}

/** What the mock stage needs back from a turn: the words, and the server's break-up when it sent
 *  one. A bare string was enough while the split was ours to guess; it no longer is. */
export interface MockReply {
  text: string;
  scenes?: import('../types').CounselorScene[];
  /** 아카이브 "기억 후보" the server sent with the answer. */
  discoveries?: { category: string; content: string }[];
}

/**
 * A stage for builds with no embedded player.
 *
 * It performs nothing — there is no counselor to move — but it MUST answer
 * ORACLE_ASK, or the flow parks at the reading hold forever and the simulator
 * shows a room that never speaks. The answer comes from whatever `reply` the
 * caller hands over (the app's mock counselor, in practice), so the walk stays
 * believable end to end without Unity.
 */
/** The four phases the staged reading is spoken over. */
const READING_PHASES = ['P11', 'P14', 'P17', 'P19'];

/**
 * Hand out `count` scenes to `buckets` phases, in order and contiguously.
 *
 * Order is the reading: scene 3 must never be spoken before scene 2, so this only ever cuts the
 * run into consecutive slices. Fewer scenes than phases leaves the tail phases empty rather than
 * repeating a scene — a phase with nothing to say falls back to its authored line, which is what
 * that line is for.
 */
export function spreadScenes<T>(scenes: T[], buckets: number): T[][] {
  const out: T[][] = Array.from({ length: buckets }, () => []);
  if (scenes.length === 0) return out;
  if (scenes.length <= buckets) {
    scenes.forEach((s, i) => out[i].push(s));
    return out;
  }
  // Remainder goes to the EARLY phases: the opening beats carry the analysis, and a long tail on
  // the closing blessing reads as padding.
  const base = Math.floor(scenes.length / buckets);
  const extra = scenes.length % buckets;
  let at = 0;
  for (let b = 0; b < buckets; b += 1) {
    const take = base + (b < extra ? 1 : 0);
    out[b] = scenes.slice(at, at + take);
    at += take;
  }
  return out;
}

export function createMockStagePort(deps: {
  onOracle: (result: import('../types').OracleResultPayload) => void;
  onSpeakDone: (cacheKey: string) => void;
  onExit: () => void;
  /** Answers a turn. Rejecting reports a connection failure, same as Unity. The mode rides along
   *  so the mock build asks the server in the same style the embedded room would. */
  reply: (question: string, loop: boolean, chatMode?: ChatMode) => Promise<MockReply>;
}): StagePort {
  const ask = (question: string, loop: boolean, chatMode?: ChatMode) => {
    deps
      .reply(question, loop, chatMode)
      .then(({ text, scenes, discoveries }) => {
        if (loop) {
          deps.onOracle({
            ok: true,
            loop,
            followup: '',
            beats: [{ phaseId: 'loop', lines: [text], scenes }],
            discoveries,
          });
          return;
        }

        // WITH SCENES the server already decided where this answer breaks and what each break is
        // for; the phases just take them in order. WITHOUT them we are back to guessing, and
        // splitting by paragraph mirrors what the oracle's own fallback does when the model
        // ignores the requested format.
        if (scenes && scenes.length > 0) {
          const spread = spreadScenes(scenes, READING_PHASES.length);
          deps.onOracle({
            ok: true,
            loop,
            followup: '',
            beats: READING_PHASES.map((phaseId, i) => ({
              phaseId,
              lines: spread[i].map(sc => sc.text),
              scenes: spread[i],
            })).filter(b => b.lines.length > 0),
            discoveries,
          });
          return;
        }

        const parts = text.split(/\n\s*\n/).filter(Boolean);
        const beats = READING_PHASES.map((phaseId, i) => ({
          phaseId,
          lines: [parts[i] ?? (i === 0 ? text : '')],
        }));
        deps.onOracle({ ok: true, loop, followup: '', beats, discoveries });
      })
      .catch(() => deps.onOracle({ ok: false, loop, followup: '', beats: [], error: 'connection' }));
  };

  return {
    phase() {},
    thinking() {},
    // No audio, so every take is "already finished" — the engine then paces the
    // beat off its own reading estimate, exactly as it does for a silent line.
    speakClip(_keys, _topic, cacheKey, _texts) {
      setTimeout(() => deps.onSpeakDone(cacheKey), 0);
    },
    speakText(_text, cacheKey) {
      setTimeout(() => deps.onSpeakDone(cacheKey), 0);
    },
    prefetchText() {},
    stopSpeak() {},
    askOracle(payload) {
      ask(payload.question, payload.loop === true, payload.chatMode);
    },
    // No player, no device. The mic button is hidden in mock builds rather than offered and then
    // failing, so these exist only to satisfy the port.
    startMic() {},
    stopMic() {},
    cancelMic() {},
    exit: deps.onExit,
  };
}
