/**
 * The consultation engine, wired to React and to the embedded player.
 *
 * The engine itself is framework-free (see `flow/engine.ts`); this hook owns the
 * three things React has to own: when the engine is created, how its state
 * reaches the render, and how Unity's replies get back into it.
 *
 * It starts on the UNITY_READY handshake, not on mount. Beginning earlier would
 * fire the P01 staging at a player that has not loaded the room yet — the
 * commands would be dropped and the consultation would open on an empty stage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../../shared/i18n';
import { ConsultationEngine, FlowState, StagePort } from '../flow/engine';
import { CounselorVoice } from '../flow/voice';
import { createMockStagePort, createStagePort, type MockReply } from '../bridge/stagePort';
import { getUnityBridge, isNativeUnity } from '../bridge';
import type { PhaseChoice } from '../flow/types';
import type { UnityToRNEvent } from '../types';

export interface UseConsultationOptions {
  /** The area the app already asked about — seeds the flow's topic. */
  topic?: string;
  /** The register the counselor speaks the room's own lines in. Passed at construction like `lang`
   *  rather than read from a store: the engine is built once per room and the person in the chair
   *  does not change mid-session. */
  voice?: CounselorVoice;
  /** Answers a turn when there is no embedded player. Without it the mock stage
   *  has nothing to say and the walk parks at the reading hold.
   *
   *  Returns the answer AND the server's scene break-up when there is one — the mock stage speaks
   *  the scenes in order instead of guessing where the answer breaks. */
  mockReply?: (question: string, loop: boolean) => Promise<MockReply>;
  /** Mirrored into the app's conversation history. */
  onCounselorLine?: (text: string) => void;
  onUserLine?: (text: string) => void;
  onFinished?: () => void;
}

export interface Consultation {
  state: FlowState;
  /** Unity has the room up; the walk has begun. */
  ready: boolean;
  tap(): void;
  choose(choice: PhaseChoice): void;
  submit(text: string): void;
  retry(): void;
  endLoop(): void;
  /** Stop the counselor mid-answer without asking anything. */
  hush(): void;
  /** Press the mic: silences the counselor and opens the device. */
  startMic(): void;
  /** Release it: the take is cut here and transcribed. */
  stopMic(): void;
  /** Drop the take — and give the counselor back the answer she was cut off in. */
  cancelMic(): void;
  /** Whether this build can record at all. Only the embedded player owns the device. */
  micAvailable: boolean;
  /** Give the counselor her memory of the last session, to open with. Late by nature — the room
   *  asks the server for it while the player is still loading — and ignored once she has spoken. */
  remember(opening: string): void;
}

export function useConsultationEngine(opts: UseConsultationOptions): Consultation {
  const lang = useLang();
  const [ready, setReady] = useState(!isNativeUnity());
  const [state, setState] = useState<FlowState>(() => emptyish());
  const engineRef = useRef<ConsultationEngine | null>(null);

  // Held in a ref so the engine — created once — always calls the CURRENT
  // callbacks. Rebuilding the engine when a parent re-renders would restart the
  // consultation from P01, mid-session.
  const cbs = useRef(opts);
  cbs.current = opts;

  const stage: StagePort = useMemo(
    () =>
      isNativeUnity()
        ? createStagePort(getUnityBridge(), () => cbs.current.onFinished?.())
        : createMockStagePort({
            onOracle: result => engineRef.current?.onOracleResult(result),
            onSpeakDone: key => engineRef.current?.onSpeakDone(key),
            onExit: () => cbs.current.onFinished?.(),
            reply: (question, loop) =>
              cbs.current.mockReply?.(question, loop) ?? Promise.reject(new Error('no mock reply')),
          }),
    [],
  );

  // One engine per mounted room.
  useEffect(() => {
    const engine = new ConsultationEngine({
      stage,
      lang,
      presetTopic: opts.topic,
      voice: opts.voice,
      onCounselorLine: text => cbs.current.onCounselorLine?.(text),
      onUserLine: text => cbs.current.onUserLine?.(text),
      onFinished: () => cbs.current.onFinished?.(),
    });
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setState);
    setState(engine.getState());
    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
    // `lang` is applied through setLang below rather than by rebuilding: a
    // language change mid-consultation must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    engineRef.current?.setLang(lang);
  }, [lang]);

  // Unity → engine. ORACLE_RESULT and SPEAK_DONE are the only two replies the
  // walk actually waits on; everything else on the channel belongs to the room.
  useEffect(() => {
    return getUnityBridge().onEvent((e: UnityToRNEvent) => {
      if (e.type === 'UNITY_READY') setReady(true);
      else if (e.type === 'ORACLE_RESULT') engineRef.current?.onOracleResult(e.payload);
      else if (e.type === 'SPEAK_DONE') engineRef.current?.onSpeakDone(e.payload.cacheKey);
      else if (e.type === 'MIC_STATE') engineRef.current?.onMicState(e.payload.state, e.payload.level);
      else if (e.type === 'MIC_RESULT') engineRef.current?.onMicResult(e.payload);
    });
  }, []);

  // Begin once, when the stage is actually there to be staged.
  const begun = useRef(false);
  useEffect(() => {
    if (!ready || begun.current || !engineRef.current) return;
    begun.current = true;
    engineRef.current.begin();
  }, [ready]);

  return {
    state,
    ready,
    tap: useCallback(() => engineRef.current?.tap(), []),
    choose: useCallback((c: PhaseChoice) => engineRef.current?.choose(c), []),
    submit: useCallback((t: string) => engineRef.current?.submitQuestion(t), []),
    retry: useCallback(() => engineRef.current?.retry(), []),
    endLoop: useCallback(() => engineRef.current?.endLoop(), []),
    hush: useCallback(() => engineRef.current?.hush(), []),
    startMic: useCallback(() => engineRef.current?.startMic(), []),
    stopMic: useCallback(() => engineRef.current?.stopMic(), []),
    cancelMic: useCallback(() => engineRef.current?.cancelMic(), []),
    remember: useCallback((opening: string) => engineRef.current?.setRecallOpening(opening), []),
    // The mock stage has no microphone, so the button is hidden rather than offered and then
    // failing — the same rule the room follows everywhere else about not pretending.
    micAvailable: isNativeUnity(),
  };
}

function emptyish(): FlowState {
  return {
    phaseId: null,
    screen: 'none',
    speaker: '',
    line: '',
    choices: [],
    canTap: false,
    inputEnabled: false,
    notice: null,
    report: null,
    transcript: [],
    suggestion: '',
    topic: '',
    tone: '',
    emotion: 'neutral',
    finished: false,
    pending: false,
    speaking: false,
    mic: { state: 'idle', level: 0, error: '' },
  };
}
