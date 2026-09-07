/**
 * The engine's view of Unity: staging commands out, nothing else.
 *
 * Deliberately thin. `ConsultationEngine` must stay testable without a renderer
 * or a native module, so it never touches `unityBridge` directly — it takes a
 * `StagePort`, and this is the one that speaks to the real player.
 */
import type { StagePort } from '../flow/engine';
import type { OracleAskPayload, StagePhasePayload, UnityBridge } from '../types';

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
    exit: onExit,
  };
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
export function createMockStagePort(deps: {
  onOracle: (result: import('../types').OracleResultPayload) => void;
  onSpeakDone: (cacheKey: string) => void;
  onExit: () => void;
  /** Answers a turn. Rejecting reports a connection failure, same as Unity. */
  reply: (question: string, loop: boolean) => Promise<string>;
}): StagePort {
  const ask = (question: string, loop: boolean) => {
    deps
      .reply(question, loop)
      .then(text => {
        // The staged reading is one answer spread over four beats; the loop is
        // a single short turn. Splitting by paragraph mirrors what the oracle's
        // own fallback does when the model ignores the requested format.
        const parts = text.split(/\n\s*\n/).filter(Boolean);
        const beats = loop
          ? [{ phaseId: 'loop', lines: [text] }]
          : ['P11', 'P14', 'P17', 'P19'].map((phaseId, i) => ({
              phaseId,
              lines: [parts[i] ?? (i === 0 ? text : '')],
            }));
        deps.onOracle({ ok: true, loop, followup: '', beats });
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
      ask(payload.question, payload.loop === true);
    },
    exit: deps.onExit,
  };
}
