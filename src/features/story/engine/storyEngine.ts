import type {
  Beat, ChapterScript, LogEntry, Permission, PlateId, ProgressChoice, StoryStage, TurnResult,
} from '../types';

/**
 * The story's state machine, free of React so it can be tested step by step.
 *
 * `run()` walks the script from (node, index), applying the silent steps (scene changes, flags,
 * jumps) until it reaches something the player has to see or do: a beat (narration, a line), a
 * free-talk stretch, or the end. The screen shows that, and calls `advance()` on a tap.
 */
export interface StoryState {
  node: string;
  index: number;
  plate: PlateId | null;
  permission: Permission;
  catName: string | null;
  /** The free-talk stretch the player is in, or null while the script is playing. */
  stage: StoryStage | null;
  /** Plain turns in the current stage (resets on a stage change) — gates "다녀올게" and the nudge. */
  turns: number;
  log: LogEntry[];
  /** The suggestions shown in free talk: the server's latest, or the stage's defaults. */
  suggestions: string[];
  finished: boolean;
  /** The door clicked (scene sfx) since the screen last looked — the screen plays it and clears. */
  sfx: 'door' | null;
}

export type Shown =
  | { kind: 'beat'; beat: Beat }
  | { kind: 'free'; stage: StoryStage }
  | { kind: 'end' }
  | { kind: 'title' };

export function initialState(script: ChapterScript, withPrologue = false): StoryState {
  return {
    node: withPrologue && script.prologue ? script.prologue : script.start,
    index: 0,
    plate: null,
    permission: 'none',
    catName: null,
    stage: null,
    turns: 0,
    log: [],
    suggestions: [],
    finished: false,
    sfx: null,
  };
}

/** Walks silent steps; returns the state parked on the next thing to show and what that is. */
export function run(script: ChapterScript, s0: StoryState): { state: StoryState; shown: Shown } {
  let s = { ...s0 };
  for (let guard = 0; guard < 200; guard++) {
    const steps = script.nodes[s.node];
    const step = steps?.[s.index];
    if (!step) return { state: { ...s, finished: true }, shown: { kind: 'end' } };
    switch (step.kind) {
      case 'scene':
        s = { ...s, plate: step.plate, sfx: step.sfx ?? s.sfx, index: s.index + 1 };
        continue;
      case 'set':
        s = { ...s, permission: step.permission, index: s.index + 1 };
        continue;
      case 'goto':
        s = { ...s, node: step.node, index: 0 };
        continue;
      case 'title':
        return { state: s, shown: { kind: 'title' } };
      case 'end':
        return { state: { ...s, finished: true, stage: null }, shown: { kind: 'end' } };
      case 'free': {
        const fresh = s.stage !== step.stage;
        s = {
          ...s,
          stage: step.stage,
          turns: fresh ? 0 : s.turns,
          suggestions: fresh || !s.suggestions.length ? script.stages[step.stage].suggestions : s.suggestions,
        };
        return { state: s, shown: { kind: 'free', stage: step.stage } };
      }
      case 'narr':
      case 'cat':
      case 'me': {
        const beat: Beat = step.kind === 'cat'
          ? { role: 'cat', text: step.text, mood: step.mood }
          : { role: step.kind, text: step.text };
        return { state: { ...s, stage: null }, shown: { kind: 'beat', beat } };
      }
    }
  }
  throw new Error(`story script loops at ${s0.node}:${s0.index}`);
}

/** The beat on screen was read: log it and move past it. */
export function advance(state: StoryState, beat: Beat | null): StoryState {
  const log = beat ? [...state.log, { role: beat.role, text: beat.text } as LogEntry] : state.log;
  return { ...state, index: state.index + 1, log };
}

/** Jump to a node (a progress choice, or where an intent leads). */
export function jump(state: StoryState, node: string): StoryState {
  return { ...state, node, index: 0, stage: null };
}

/** The progress choices open right now ("다녀올게" after enough morning talk). */
export function progressChoices(script: ChapterScript, state: StoryState): ProgressChoice[] {
  if (!state.stage) return [];
  return script.stages[state.stage].progress.filter(p =>
    state.turns >= p.minTurns && (!p.permission || p.permission.includes(state.permission)),
  );
}

/** Where a free turn's meaning sends the story, if anywhere. */
export function nodeForIntent(state: StoryState, intent: TurnResult['intent']): string | null {
  switch (state.stage) {
    case 'arrival':
    case 'permission':
      if (intent === 'stay') return 'stayed';
      if (intent === 'refuse') return 'leave';
      return null;
    case 'doorstep':
      return intent === 'invite' || intent === 'stay' ? 'comeBack' : null;
    case 'morning_ready':
      return intent === 'refuse' ? 'leave' : null;
    default:
      return null;
  }
}

/** The player's line went out: log it and count the turn. */
export function said(state: StoryState, text: string): StoryState {
  return { ...state, log: [...state.log, { role: 'me', text }] };
}

/**
 * The cat answered. Returns the beats to show (his action folds into his first line) and the
 * state to continue from once they have been read — still in free talk, or jumped to wherever the
 * player's meaning leads (`then`).
 */
export function answered(
  script: ChapterScript,
  state: StoryState,
  result: TurnResult,
): { beats: Beat[]; state: StoryState; then: string | null } {
  const beats: Beat[] = [];
  let action: string | undefined;
  for (const l of result.lines) {
    if (l.kind === 'action') action = action ? `${action} ${l.text}` : l.text;
    else {
      beats.push({ role: 'cat', text: l.text, action, mood: result.mood });
      action = undefined;
    }
  }
  const log: LogEntry[] = [...state.log];
  for (const b of beats) {
    if (b.action) log.push({ role: 'action', text: b.action });
    log.push({ role: 'cat', text: b.text });
  }
  const catName = result.name?.trim() || state.catName;
  let next: StoryState = {
    ...state,
    log,
    catName,
    turns: state.turns + 1,
    suggestions: result.suggestions.length ? result.suggestions : state.suggestions,
  };
  let then = nodeForIntent(state, result.intent);
  // The cat asks whether he may stay once the first surprise has had its turns (CH01-S02's
  // conditional line) — only if nothing else has decided it.
  const nudge = state.stage ? script.stages[state.stage].nudge : undefined;
  if (!then && nudge && next.turns >= nudge.turns && next.permission === 'none') then = nudge.node;
  if (then) next = { ...next, suggestions: [] };
  return { beats, state: next, then };
}

/** The last few lines, in the server's vocabulary, for the next free turn. */
export function historyForServer(state: StoryState, max = 14): { role: 'user' | 'cat' | 'narrator'; text: string }[] {
  return state.log.slice(-max).map(e => ({
    role: e.role === 'me' ? 'user' : e.role === 'narr' ? 'narrator' : 'cat',
    text: e.role === 'action' ? `(${e.text})` : e.text,
  }));
}
