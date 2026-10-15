import type { StagePort } from '../flow/engine';

/** One-shot gestures the cat can play over whatever loop he is in. */
export type CatGesture = 'wave' | 'nod' | 'bow' | 'surprise' | 'explain' | 'bless' | 'fret';

/** What the room tells the cat, as it happens. */
export type CatCue = { type: 'gesture'; gesture: CatGesture } | { type: 'thinking'; on: boolean };

/**
 * The flow's staging triggers → a gesture.
 *
 * The triggers were written for the 3D rooms (`consultationFlow.json`: "GreetingHandGesture",
 * "HandOnChin", …), so this reads them the way a director would: the FIRST trigger in a phase that
 * the cat has a gesture for wins. Everything else in the list (camera moves, walking in) has no
 * meaning for a seated cat and is ignored.
 */
const TRIGGER_GESTURE: Record<string, CatGesture> = {
  GreetingHandGesture: 'wave',
  GoodbyeGesture: 'wave',
  CounselorSlightSurprise: 'surprise',
  SlightSurprise: 'surprise',
  Surprise: 'surprise',
  SlightBow: 'bow',
  SmallBow: 'bow',
  Nod: 'nod',
  SlightNod: 'nod',
  OpenPalmGesture: 'explain',
  OpenHandGesture: 'explain',
  OpenHands: 'explain',
  PalmOpen: 'explain',
  Explain: 'explain',
  Serious: 'fret',
};

/** P20 says goodbye with a bow AND a wave; the bless is his own sign-off. */
const PHASE_GESTURE: Record<string, CatGesture> = {
  P01: 'wave',
  // A chat-first room opens here instead of at P01, so this is his hello.
  LOOP_OPEN: 'wave',
  P20: 'bless',
};

export function gestureForPhase(phaseId: string, triggers: string[]): CatGesture | null {
  if (PHASE_GESTURE[phaseId]) return PHASE_GESTURE[phaseId];
  for (const t of triggers) {
    const g = TRIGGER_GESTURE[t];
    if (g) return g;
  }
  return null;
}

/**
 * The mock stage, with a cat watching it.
 *
 * The mock port already does the part that matters — it answers ORACLE_ASK from the server and
 * reports every line as spoken — but it throws `phase` and `thinking` away because there was never
 * anyone to perform them. Here there is, so those two are passed on as cues before the base port
 * gets them.
 */
export function withCatCues(base: StagePort, onCue: (cue: CatCue) => void): StagePort {
  return {
    ...base,
    phase(payload) {
      const g = gestureForPhase(payload.phaseId, payload.animationTriggers ?? []);
      if (g) onCue({ type: 'gesture', gesture: g });
      base.phase(payload);
    },
    thinking(on) {
      onCue({ type: 'thinking', on });
      base.thinking(on);
    },
  };
}
