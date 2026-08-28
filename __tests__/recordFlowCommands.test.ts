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
    stopSpeak: () => record({ type: 'STAGE_STOP_SPEAK' }),
    askOracle: (payload: OracleAskPayload) => record({ type: 'ORACLE_ASK', payload }),
    exit: () => record({ type: 'SESSION_END' }),
  };

  engine = new ConsultationEngine({ stage, lang: 'ko', scheduler: sched, presetTopic: 'wealth' });

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
  expect(phases).toContain('P18');
  expect(phases).toContain('P20');
  expect(phases).not.toContain('P03');
  expect(parsed.some(e => e.type === 'ORACLE_ASK')).toBe(true);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        note: 'GENERATED by prayers/__tests__/recordFlowCommands.test.ts — do not hand-edit.',
        recordedAt: '(deterministic: the fake clock, not wall time)',
        commands: log,
      },
      null,
      2,
    ) + '\n',
  );
});
