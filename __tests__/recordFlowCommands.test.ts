/**
 * Record the exact command stream the engine sends Unity, and keep it in the
 * repo.
 *
 * Now that RN owns the flow, the Unity half has nothing to drive it in the
 * Editor: opening ConsultationSolo directly runs the OLD in-engine walk, which
 * is precisely the code the move retired. Testing the room by hand there proves
 * nothing about the new seam.
 *
 * So the engine's own output becomes the fixture. This walks a whole
 * consultation — greeting, question, reading, loop, farewell — and writes every
 * bridge message in order to `Tools/consultation/flow_commands.json`, which
 * `ConsultationReplayDriver` feeds back into `RNBridge.OnMessage` inside Unity.
 * The room is then exercised by the real flow rather than by a script someone
 * wrote to match it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConsultationEngine, Scheduler, StagePort } from '../src/features/counseling/flow/engine';
import type { OracleAskPayload, StagePhasePayload } from '../src/features/counseling/types';

const OUT = path.join(__dirname, '../../Tools/consultation/flow_commands.json');

class FakeScheduler implements Scheduler {
  private seq = 1;
  private queue = new Map<number, { at: number; fn: () => void }>();
  private clock = 0;
  set(fn: () => void, ms: number) {
    const id = this.seq++;
    this.queue.set(id, { at: this.clock + ms, fn });
    return id;
  }
  clear(h: number) {
    this.queue.delete(h);
  }
  now() {
    return this.clock;
  }
  advance(ms: number) {
    const target = this.clock + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, e] of this.queue) if (e.at < nextAt) ((nextAt = e.at), (nextId = id));
      if (nextId === null || nextAt > target) break;
      const e = this.queue.get(nextId)!;
      this.queue.delete(nextId);
      this.clock = Math.max(this.clock, e.at);
      e.fn();
    }
    this.clock = target;
  }
}

/**
 * One recorded bridge message.
 *
 * `json` is the message ALREADY SERIALIZED — byte for byte what
 * `NativeUnityBridge.post()` puts on the wire. Unity replays the string
 * straight into `RNBridge.OnMessage` rather than re-encoding a parsed object,
 * so the replay cannot accidentally send a shape the RN app never sends.
 */
interface Recorded {
  atMs: number;
  json: string;
}

/**
 * What the RN screen was showing when a command went out.
 *
 * The command stream says what Unity was told to do; it says nothing about what
 * the player was reading while it did it — and that half of the session lives
 * entirely on this side of the bridge. Without it the Unity-side inspector can
 * only guess the copy from the flow asset, which is right for the scripted
 * beats and silent about everything the engine decides: the thinking spinner,
 * the notice, the report, the loop transcript, the follow-up pill.
 *
 * Flattened to primitives and string arrays on purpose — `JsonUtility` reads
 * these directly, and it cannot parse a dictionary, a null object field or a
 * nested list of objects without a mirror class per shape.
 */
interface UiSnapshot {
  atMs: number;
  phaseId: string;
  screen: string;
  speaker: string;
  line: string;
  choices: string[];
  canTap: boolean;
  inputEnabled: boolean;
  /** The notice body, or '' when no notice is up. */
  notice: string;
  /** "label\tscore" per row — the report card's bars. */
  reportRows: string[];
  reportKeywords: string;
  reportPeriod: string;
  /** "user\t…" / "counselor\t…" — the free-chat transcript so far. */
  transcript: string[];
  suggestion: string;
  topic: string;
  finished: boolean;
}

test('records a full consultation as bridge commands', () => {
  const sched = new FakeScheduler();
  const log: Recorded[] = [];
  let engine!: ConsultationEngine;

  const record = (event: unknown) =>
    log.push({ atMs: Math.round(sched.now()), json: JSON.stringify(event) });

  const stage: StagePort = {
    phase: (payload: StagePhasePayload) => record({ type: 'STAGE_PHASE', payload }),
    thinking: (on: boolean) => record({ type: 'STAGE_THINKING', payload: { on } }),
    speakClip: (locKeys, topic, cacheKey) => {
      record({ type: 'STAGE_SPEAK', payload: { mode: 'clip', locKeys, topic, cacheKey } });
      // The replay driver waits on Unity's own SPEAK_DONE, so the recording must
      // not bake in a pause the real player would decide for itself.
      engine.onSpeakDone(cacheKey);
    },
    speakText: (text, cacheKey) => {
      record({ type: 'STAGE_SPEAK', payload: { mode: 'tts', text, cacheKey } });
      engine.onSpeakDone(cacheKey);
    },
    prefetchText: (text, cacheKey) =>
      record({ type: 'STAGE_SPEAK', payload: { mode: 'tts', text, cacheKey, prefetch: true } }),
    stopSpeak: () => record({ type: 'STAGE_STOP_SPEAK' }),
    askOracle: (payload: OracleAskPayload) => record({ type: 'ORACLE_ASK', payload }),
    exit: () => record({ type: 'SESSION_END' }),
  };

  engine = new ConsultationEngine({ stage, lang: 'ko', scheduler: sched, presetTopic: 'wealth' });

  // Every distinct screen the walk puts up, stamped on the same fake clock as the
  // commands so the two can be replayed side by side. Subscribed before begin()
  // so the opening beat is captured rather than inferred.
  const uiLog: UiSnapshot[] = [];
  engine.subscribe(s => {
    const snap: UiSnapshot = {
      atMs: Math.round(sched.now()),
      phaseId: s.phaseId ?? '',
      screen: s.screen,
      speaker: s.speaker,
      line: s.line,
      choices: s.choices.map(c => c.label),
      canTap: s.canTap,
      inputEnabled: s.inputEnabled,
      notice: s.notice ? s.notice.body : '',
      reportRows: s.report ? s.report.rows.map(r => `${r.label}\t${r.score}`) : [],
      reportKeywords: s.report ? s.report.keywords : '',
      reportPeriod: s.report ? s.report.period : '',
      transcript: s.transcript.map(t => `${t.role}\t${t.text}`),
      suggestion: s.suggestion,
      topic: s.topic,
      finished: s.finished,
    };
    // The engine patches state field by field, so one beat can emit several
    // identical-looking snapshots. Only keep the ones that changed something.
    const last = uiLog[uiLog.length - 1];
    if (last && JSON.stringify({ ...last, atMs: 0 }) === JSON.stringify({ ...snap, atMs: 0 })) return;
    uiLog.push(snap);
  });

  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('올해 재물운이 어떤가요?');
  sched.advance(30_000);

  // Stand in for the server so the recording covers the beats past P11. The
  // replay in Unity asks the REAL oracle — this only shapes the walk.
  engine.onOracleResult({
    ok: true,
    followup: '다른 것도 궁금하신가요?',
    beats: [
      { phaseId: 'P11', lines: ['첫 인상입니다.'] },
      { phaseId: 'P13', lines: ['지지를 봅니다.'] },
      { phaseId: 'P14', lines: ['더 깊이 봅니다.'] },
      { phaseId: 'P15', lines: ['시기를 봅니다.'] },
      { phaseId: 'P17', lines: ['정리하겠습니다.'] },
      { phaseId: 'P19', lines: ['마무리입니다.'] },
    ],
    report: { rows: [{ label: '재물', score: 72 }], keywords: '변화', period: '9월~11월' },
  });
  sched.advance(300_000);
  engine.endLoop();
  sched.advance(300_000);

  const parsed = log.map(r => JSON.parse(r.json) as any);
  const phases = parsed
    .filter(e => e.type === 'STAGE_PHASE')
    .map(e => e.payload.phaseId as string);

  // The walk the replay is meant to reproduce: greeting, the question, the
  // cover phases, the reading, the report and the farewell.
  expect(phases[0]).toBe('P01');
  expect(phases).toContain('P05');
  expect(phases).toContain('P11');
  expect(phases).toContain('P17');
  expect(phases).toContain('P20');
  expect(phases).not.toContain('P03');
  // The fixed-months line (P15) and the report card (P18) are stepped over.
  expect(phases).not.toContain('P15');
  expect(phases).not.toContain('P18');
  expect(parsed.some(e => e.type === 'ORACLE_ASK')).toBe(true);

  // The screens the walk actually puts up. Asserted rather than merely written,
  // because an empty `ui` array still produces a valid file and the Unity
  // inspector would show a blank phone with nothing to say why.
  const screens = uiLog.map(s => s.screen);
  expect(screens).toContain('questionBox');
  expect(screens).toContain('thinking');
  expect(screens).not.toContain('report');
  expect(screens).toContain('loop');
  // P18 is skipped, so no UI snapshot ever carries report rows.
  expect(uiLog.some(s => s.reportRows.length > 0)).toBe(false);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        note: 'GENERATED by prayers/__tests__/recordFlowCommands.test.ts — do not hand-edit.',
        recordedAt: '(deterministic: the fake clock, not wall time)',
        commands: log,
        ui: uiLog,
      },
      null,
      2,
    ) + '\n',
  );
});
