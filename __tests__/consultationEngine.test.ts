/**
 * The 20-phase walk, without a renderer or a player.
 *
 * These are the parts that used to be impossible to check: the flow only ran
 * inside Unity, so "does P05 wait for the player" and "does the walk hold at
 * P11 until the reading lands" could only be answered by sitting through a
 * session. The engine takes an injectable scheduler and a stage double, so the
 * whole consultation runs in a few milliseconds of fake time.
 */
import { ConsultationEngine, Scheduler, StagePort } from '../src/features/counseling/flow/engine';
import type { OracleAskPayload, StagePhasePayload } from '../src/features/counseling/types';

/** Fake time: every timer is queued and fired by hand, so a 9-second dwell
 *  costs nothing and the test never races the real clock. */
class FakeScheduler implements Scheduler {
  private seq = 1;
  private queue = new Map<number, { at: number; fn: () => void }>();
  private clock = 0;

  set(fn: () => void, ms: number): number {
    const id = this.seq++;
    this.queue.set(id, { at: this.clock + ms, fn });
    return id;
  }

  clear(handle: number): void {
    this.queue.delete(handle);
  }

  now(): number {
    return this.clock;
  }

  /** Run every timer due within `ms`, repeatedly — a phase schedules the next
   *  one from inside its own callback. */
  advance(ms: number) {
    const target = this.clock + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, entry] of this.queue) {
        if (entry.at < nextAt) {
          nextAt = entry.at;
          nextId = id;
        }
      }
      if (nextId === null || nextAt > target) break;
      const entry = this.queue.get(nextId)!;
      this.queue.delete(nextId);
      // Monotonic: a timer already due must not drag the clock backwards.
      this.clock = Math.max(this.clock, entry.at);
      entry.fn();
    }
    this.clock = target;
  }
}

class StageDouble implements StagePort {
  phases: StagePhasePayload[] = [];
  asks: OracleAskPayload[] = [];
  thinkingCalls: boolean[] = [];
  spoken: string[] = [];
  exited = false;
  /** Set false to make a take hang, the way a long TTS reply does. */
  autoFinishSpeech = true;
  private engine!: ConsultationEngine;

  bind(engine: ConsultationEngine) {
    this.engine = engine;
  }

  phase(p: StagePhasePayload) {
    this.phases.push(p);
  }
  thinking(on: boolean) {
    this.thinkingCalls.push(on);
  }
  speakClip(_keys: string[], _topic: string, cacheKey: string) {
    this.spoken.push(cacheKey);
    if (this.autoFinishSpeech) this.engine.onSpeakDone(cacheKey);
  }
  speakText(_text: string, cacheKey: string) {
    this.spoken.push(cacheKey);
    if (this.autoFinishSpeech) this.engine.onSpeakDone(cacheKey);
  }
  prefetched: string[] = [];
  prefetchText(_text: string, cacheKey: string) {
    this.prefetched.push(cacheKey);
  }
  stopSpeak() {}
  askOracle(p: OracleAskPayload) {
    this.asks.push(p);
  }
  exit() {
    this.exited = true;
  }

  get phaseIds() {
    return this.phases.map(p => p.phaseId);
  }
}

function build() {
  const sched = new FakeScheduler();
  const stage = new StageDouble();
  const engine = new ConsultationEngine({ stage, lang: 'ko', scheduler: sched });
  stage.bind(engine);
  return { sched, stage, engine };
}

test('opens on the entrance beat and reaches the question box on its own', () => {
  const { sched, stage, engine } = build();
  engine.begin();

  expect(stage.phaseIds[0]).toBe('P01');

  // P01 is authored at 4s, P02 dwells on its line; nothing here needs a tap.
  sched.advance(60_000);

  // P03/P04 are the talk-first skips — they must never be staged.
  expect(stage.phaseIds).not.toContain('P03');
  expect(stage.phaseIds).not.toContain('P04');
  expect(engine.getState().screen).toBe('questionBox');
  expect(engine.getState().inputEnabled).toBe(true);
});

test('the question box waits for the player, however long that takes', () => {
  const { sched, engine } = build();
  engine.begin();
  sched.advance(60_000);
  const parked = engine.getState().phaseId;

  sched.advance(600_000);

  expect(engine.getState().phaseId).toBe(parked);
});

test('submitting the question asks the oracle and holds P11 until it answers', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);

  engine.submitQuestion('  올해 재물운이 어떤가요?  ');

  expect(stage.asks).toHaveLength(1);
  expect(stage.asks[0].question).toBe('올해 재물운이 어떤가요?');

  // The cover phases play while the server is working, and then the walk holds
  // rather than speaking the asset's placeholder line.
  sched.advance(120_000);
  expect(engine.getState().screen).toBe('thinking');
  expect(stage.phaseIds).not.toContain('P11');
  expect(stage.thinkingCalls).toContain(true);

  engine.onOracleResult({
    ok: true,
    followup: '무엇이 더 궁금하신가요?',
    beats: [
      { phaseId: 'P11', lines: ['첫 인상입니다.'] },
      { phaseId: 'P19', lines: ['마무리입니다.'] },
    ],
  });
  sched.advance(2_000);

  expect(stage.phaseIds).toContain('P11');
  expect(engine.getState().line).toBe('첫 인상입니다.');
});

test('a failed turn shows the notice instead of reciting the error four times', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');

  engine.onOracleResult({ ok: false, error: 'upstream', followup: '', beats: [] });
  sched.advance(120_000);

  expect(engine.getState().screen).toBe('notice');
  expect(stage.phaseIds).not.toContain('P11');

  // Retry re-asks the SAME question — the flow still holds it.
  engine.retry();
  expect(stage.asks).toHaveLength(2);
  expect(stage.asks[1].question).toBe('질문');
});

test('a spoken take outlasting the reading estimate keeps the beat up', () => {
  const { sched, stage, engine } = build();
  stage.autoFinishSpeech = false;
  engine.begin();

  // P01 is a 4s beat with a recorded line. Far past its dwell, the counselor is
  // still talking, so the walk must not have moved on.
  sched.advance(60_000);
  const held = engine.getState().phaseId;
  expect(held).toBe('P01');

  stage.spoken.forEach(key => engine.onSpeakDone(key));
  sched.advance(5_000);
  expect(engine.getState().phaseId).not.toBe('P01');
});

test('the free-chat loop takes over after the last reading beat', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  engine.onOracleResult({
    ok: true,
    followup: '다음 질문',
    beats: [
      { phaseId: 'P11', lines: ['하나'] },
      { phaseId: 'P14', lines: ['둘'] },
      { phaseId: 'P17', lines: ['셋'] },
      { phaseId: 'P19', lines: ['넷'] },
    ],
  });
  sched.advance(300_000);

  expect(engine.getState().screen).toBe('loop');
  expect(engine.getState().suggestion).toBe('다음 질문');

  engine.submitQuestion('추가 질문');
  expect(stage.asks[stage.asks.length - 1].loop).toBe(true);

  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '또 다른 질문',
    beats: [{ phaseId: 'loop', lines: ['답변입니다.'] }],
  });

  const transcript = engine.getState().transcript;
  expect(transcript[transcript.length - 1]).toEqual({ role: 'counselor', text: '답변입니다.' });
  expect(engine.getState().inputEnabled).toBe(true);

  // Leaving the loop is a FORWARD jump to the farewell, not an exit.
  engine.endLoop();
  expect(stage.phaseIds).toContain('P20');
});

test('both halves of the session reach the history', () => {
  const counselor: string[] = [];
  const user: string[] = [];
  const sched = new FakeScheduler();
  const stage = new StageDouble();
  const engine = new ConsultationEngine({
    stage,
    lang: 'ko',
    scheduler: sched,
    onCounselorLine: t => counselor.push(t),
    onUserLine: t => user.push(t),
  });
  stage.bind(engine);

  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('내 질문');

  expect(user).toContain('내 질문');
  expect(counselor.length).toBeGreaterThan(0);
});

/** Drive a session into the loop and send one follow-up question. */
function intoLoop(stage: StageDouble, engine: ConsultationEngine, sched: FakeScheduler) {
  // Recorded takes finish on their own on the way in; only the loop's takes are
  // held open, so the tests below can step the delivery a chunk at a time.
  stage.autoFinishSpeech = true;
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [
      { phaseId: 'P11', lines: ['하나'] },
      { phaseId: 'P14', lines: ['둘'] },
      { phaseId: 'P17', lines: ['셋'] },
      { phaseId: 'P19', lines: ['넷'] },
    ],
  });
  sched.advance(300_000);
  expect(engine.getState().screen).toBe('loop');
  stage.autoFinishSpeech = false;
  engine.submitQuestion('추가 질문');
  // The "one moment" line is out; let it finish so the answer may start.
  stage.spoken.forEach(key => engine.onSpeakDone(key));
}

const LONG_ANSWER =
  '어머나, 정말 재미있는 사주네요! 재물이 넘실넘실 넘치는데 끌어다 쓸 도구가 없는 형국이에요. ' +
  '그래서 식상을 채우면 흐름이 훨씬 매끄러워질 수 있어요.\n\n' +
  '지금 30대 대운인 임신 대운이 물의 기운을 보태 주고 있으니 슬슬 도구를 써 봐도 괜찮은 때예요.';

test('a loop answer is revealed chunk by chunk, in step with the voice', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  const before = engine.getState().transcript.length;
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: [LONG_ANSWER] }],
  });

  // Every chunk was warmed the moment the answer arrived, under the keys the
  // takes will be asked for.
  expect(stage.prefetched).toEqual(
    expect.arrayContaining(['loop_1.0', 'loop_1.1', 'loop_1.2']),
  );

  // Only the opening sentence is on screen while it is being spoken.
  let transcript = engine.getState().transcript;
  expect(transcript).toHaveLength(before + 1);
  expect(transcript[before]).toEqual({ role: 'counselor', text: '어머나, 정말 재미있는 사주네요!' });
  expect(stage.spoken[stage.spoken.length - 1]).toBe('loop_1.0');

  // Its take ends → the next chunk is spoken and the SAME bubble grows.
  engine.onSpeakDone('loop_1.0');
  transcript = engine.getState().transcript;
  expect(transcript).toHaveLength(before + 1);
  expect(transcript[before].text.startsWith('어머나, 정말 재미있는 사주네요! 재물이')).toBe(true);
  expect(stage.spoken[stage.spoken.length - 1]).toBe('loop_1.1');

  // The paragraph break the model wrote survives the re-assembly.
  engine.onSpeakDone('loop_1.1');
  transcript = engine.getState().transcript;
  expect(transcript[before].text).toContain('\n\n지금 30대 대운인');
  expect(stage.spoken[stage.spoken.length - 1]).toBe('loop_1.2');

  engine.onSpeakDone('loop_1.2');
  expect(engine.getState().transcript[before].text.endsWith('괜찮은 때예요.')).toBe(true);
  // Nothing more is asked for after the last chunk.
  expect(stage.spoken.filter(k => k.startsWith('loop_1.')).length).toBe(3);
});

test('asking again mid-answer shows the rest of the answer at once', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  const row = engine.getState().transcript.length;
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: [LONG_ANSWER] }],
  });
  expect(engine.getState().transcript[row].text).toBe('어머나, 정말 재미있는 사주네요!');

  engine.submitQuestion('다른 질문');
  const transcript = engine.getState().transcript;
  // The whole answer is there, above the new question.
  expect(transcript[row].text.endsWith('괜찮은 때예요.')).toBe(true);
  expect(transcript[row + 1]).toEqual({ role: 'user', text: '다른 질문' });
  // A late SPEAK_DONE for the abandoned answer speaks nothing further.
  const spokenBefore = stage.spoken.length;
  engine.onSpeakDone('loop_1.0');
  expect(stage.spoken.length).toBe(spokenBefore);
});
