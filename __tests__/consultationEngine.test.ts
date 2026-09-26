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
import type { Lang } from '../src/shared/i18n';

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
  /** Every mic command the engine sent, in order — the barge-in tests read this. */
  micCalls: string[] = [];
  thinkingCalls: boolean[] = [];
  spoken: string[] = [];
  exited = false;
  /** Set false to make a take hang, the way a long TTS reply does. */
  autoFinishSpeech = true;
  /** Hang only the takes whose key starts with this — lets a test step ONE beat
   *  by hand while the cover phases before it still pace themselves. */
  holdPrefix: string | null = null;
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
  private holds(cacheKey: string) {
    return !this.autoFinishSpeech || (this.holdPrefix !== null && cacheKey.startsWith(this.holdPrefix));
  }
  /** The loc keys of every scripted line spoken — the only place a test can see WHICH variant
   *  was chosen, since a recorded take carries keys rather than words. */
  spokenKeys: string[] = [];
  speakClip(keys: string[], _topic: string, cacheKey: string) {
    this.spokenKeys.push(...(keys ?? []));
    this.spoken.push(cacheKey);
    if (!this.holds(cacheKey)) this.engine.onSpeakDone(cacheKey);
  }
  /** The words, not just the keys — a test about WHAT is said cannot use a cache key. */
  spokenText: string[] = [];
  speakText(text: string, cacheKey: string) {
    this.spoken.push(cacheKey);
    this.spokenText.push(text);
    if (!this.holds(cacheKey)) this.engine.onSpeakDone(cacheKey);
  }
  prefetched: string[] = [];
  prefetchText(_text: string, cacheKey: string) {
    this.prefetched.push(cacheKey);
  }
  stopSpeak() {}
  askOracle(p: OracleAskPayload) {
    this.asks.push(p);
  }
  startMic(lang: string) {
    this.micCalls.push('start:' + lang);
  }
  stopMic() {
    this.micCalls.push('stop');
  }
  cancelMic() {
    this.micCalls.push('cancel');
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

test('the entrance does not act out a walk-in nobody sees', () => {
  // P01 is an Establishing shot of a counselor the player is ALREADY sitting across from — the
  // room hands over seated. The doc authored it as a walk-in, and for a while the entrance played
  // `int_door_open.mp3`, footsteps and a chair over a shot in which nothing moved: a wooden door
  // swinging open in a room that has no door on screen. The animation side was settled long ago
  // (CounselorCueAliasBuilder leaves the locomotion cues unaliased on purpose) and so was the VFX
  // side (the door light beam became a runic ring, 2026-09-10); the sound was the last piece still
  // performing the old entrance.
  //
  // Pinned here rather than in Unity because this JSON is the LAST gate before the player hears it:
  // it is exported from ConsultationFlow.asset by Tools/consultation/export_flow.py, so a re-run of
  // the Unity builder that brings the cues back arrives through this file.
  const { stage, engine } = build();
  engine.begin();

  const p01 = stage.phases[0];
  expect(p01.phaseId).toBe('P01');
  for (const cue of ['DoorOpening', 'Footsteps', 'ChairMovement']) {
    expect(p01.sound).not.toContain(cue);
  }
  // Still opens the music — silence is not the fix.
  expect(p01.sound).toContain('MusicStart');
});

test('the pillars are said properly on the path the real room actually uses', () => {
  // ⚠️ THIS IS THE TEST THAT WAS MISSING, and its absence cost a full rebuild.
  //
  // The transliteration was wired into ServerCounselorAI.reply() first, with a test proving that
  // wiring. Both were green, the build shipped — and the screenshot still had 庚辰 in the bubble,
  // because inside the embedded room RN never calls the server at all. UNITY does, and the answer
  // comes back over the bridge as ORACLE_RESULT, which that layer never touches.
  //
  // So this drives the engine the way the room does: hand it an oracle result and read back what
  // the player would see and hear.
  const { sched, stage, engine } = build();
  engine.setLang('en');
  engine.begin();
  sched.advance(60_000);           // through the cover phases to the question box
  engine.submitQuestion('How is my career going?');

  engine.onOracleResult({
    ok: true,
    loop: false,
    followup: '',
    beats: [
      // Two beats on purpose. A beat WITH scenes is spoken from the scenes; a beat without is
      // spoken from `lines`. Cleaning one and not the other was the exact shape of the earlier
      // miss, so both paths are driven here.
      { phaseId: 'P11', lines: ['This follows from 庚辰, where Direct Resource matters.'] },
      {
        phaseId: 'P14',
        lines: ['unused when scenes are present'],
        // A CounselorScene as the bridge delivers it — already mapped, not the raw wire shape.
        scenes: [
          {
            text: 'With a weak 癸 Day Master, support matters.',
            tone: 'analysis',
            emotion: 'thinking' as const,
            animation: 'talk' as const,
          },
        ],
      },
    ],
  });
  sched.advance(120_000);

  const spoken = stage.spokenText.join(' ');
  expect(spoken).toContain('Geng Chen');
  expect(spoken).toContain('Gui');
  expect(spoken).not.toMatch(/[㐀-鿿]/);
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

test('a reading beat is revealed chunk by chunk, and holds the phase until it is all said', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('올해 재물운이 어떤가요?');

  // Step P11's takes by hand — the point is that the card grows one take at a
  // time — while the cover phases before it still pace themselves.
  stage.holdPrefix = 'P11#';
  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [
      { phaseId: 'P11', lines: [LONG_ANSWER] },
      { phaseId: 'P19', lines: ['마무리입니다.'] },
    ],
  });
  sched.advance(120_000);

  expect(stage.phaseIds).toContain('P11');

  // Everything after the opener is warmed while the opener is being said. The
  // whole beat used to go to TTS in one request, which the server truncates at
  // 800 characters — anything past that was on the card and never spoken.
  expect(stage.prefetched).toEqual(expect.arrayContaining(['P11#1', 'P11#2']));

  // Only the first sentence is on the card, and it is the one being spoken.
  expect(engine.getState().line).toBe('어머나, 정말 재미있는 사주네요!');
  expect(stage.spoken[stage.spoken.length - 1]).toBe('P11#0');

  // The dwell has long since elapsed, but the phase must not move on until the
  // beat has actually been said — the card is still holding two thirds of it.
  sched.advance(120_000);
  expect(engine.getState().phaseId).toBe('P11');

  engine.onSpeakDone('P11#0');
  expect(engine.getState().line.startsWith('어머나, 정말 재미있는 사주네요! 재물이')).toBe(true);
  expect(stage.spoken[stage.spoken.length - 1]).toBe('P11#1');

  engine.onSpeakDone('P11#1');
  expect(engine.getState().line).toContain('\n\n지금 30대 대운인');
  expect(stage.spoken[stage.spoken.length - 1]).toBe('P11#2');

  // Last take done → the beat is whole, and only now may the phase be released.
  engine.onSpeakDone('P11#2');
  expect(engine.getState().line.endsWith('괜찮은 때예요.')).toBe(true);
  expect(stage.spoken.filter(k => k.startsWith('P11#')).length).toBe(3);
  sched.advance(10_000);
  expect(engine.getState().phaseId).not.toBe('P11');
});

test('tapping mid-reading shows the rest of the beat instead of skipping it', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  stage.holdPrefix = 'P11#';
  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [{ phaseId: 'P11', lines: [LONG_ANSWER] }],
  });
  sched.advance(120_000);
  expect(engine.getState().line).toBe('어머나, 정말 재미있는 사주네요!');

  // First tap completes the beat and stays on the phase: the card only holds
  // what has been spoken, so advancing here would bin text nobody has read.
  engine.tap();
  expect(engine.getState().phaseId).toBe('P11');
  expect(engine.getState().line.endsWith('괜찮은 때예요.')).toBe(true);

  // Second tap moves on, the way a tap always did.
  engine.tap();
  expect(engine.getState().phaseId).not.toBe('P11');
});

/**
 * Cutting in, and what the counselor is told about it.
 *
 * "When the user interrupts, the consultant needs to stop talking and answer based on the current
 * talking" (15-09-2026). Both halves are here: the bubble keeps only what was SPOKEN — the rest was
 * never said aloud and putting it on screen would show the player words they did not hear — and the
 * turn carries that spoken part as `interrupted`, which is the only thing the server cannot work
 * out for itself.
 */
test('asking again mid-answer cuts her off at what the player actually heard', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  const row = engine.getState().transcript.length;
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: [LONG_ANSWER] }],
  });
  const heard = '어머나, 정말 재미있는 사주네요!';
  expect(engine.getState().transcript[row].text).toBe(heard);

  engine.submitQuestion('다른 질문');
  const transcript = engine.getState().transcript;
  // Only the spoken chunk stands — the paragraph she never reached is dropped, not dumped.
  expect(transcript[row].text).toBe(heard);
  expect(transcript[row].text.endsWith('괜찮은 때예요.')).toBe(false);
  expect(transcript[row + 1]).toEqual({ role: 'user', text: '다른 질문' });
  // And she is told where she was cut off.
  expect(stage.asks[stage.asks.length - 1].interrupted).toBe(heard);
  // A late SPEAK_DONE for the abandoned answer speaks nothing further.
  const spokenBefore = stage.spoken.length;
  engine.onSpeakDone('loop_1.0');
  expect(stage.spoken.length).toBe(spokenBefore);
});

/**
 * The mic IS the interruption: she falls silent on the press, seconds before there is a question.
 * A take that comes back with nothing must therefore be undoable, or a mistap leaves her mute
 * half-way through a paragraph the player did want.
 */
test('opening the mic silences her, and an empty take gives the answer back', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  const row = engine.getState().transcript.length;
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '다음 질문',
    beats: [{ phaseId: 'loop', lines: [LONG_ANSWER] }],
  });
  const heard = '어머나, 정말 재미있는 사주네요!';

  engine.startMic();
  expect(stage.micCalls).toEqual(['start:ko']);
  // Not `listening` yet: the permission dialog sits between the press and the device, and on the
  // simulator that was eight seconds of a room claiming to hear a microphone that was not open.
  expect(engine.getState().mic.state).toBe('opening');
  expect(engine.getState().speaking).toBe(false);
  expect(engine.getState().transcript[row].text).toBe(heard);

  // Unity opens the device and says so.
  engine.onMicState('listening', 0.04);
  expect(engine.getState().mic.state).toBe('listening');

  // She heard nothing. The rest of the answer comes back rather than being lost with the take.
  engine.onMicResult({ ok: false, text: '', error: 'no_speech' });
  expect(engine.getState().mic.error).toBe('no_speech');
  expect(engine.getState().transcript[row].text.endsWith('괜찮은 때예요.')).toBe(true);
  expect(engine.getState().inputEnabled).toBe(true);
  expect(engine.getState().suggestion).toBe('다음 질문');
});

/**
 * A server that cannot transcribe at all takes the button away.
 *
 * Production ran for weeks without `/prayers/stt`: every press recorded, uploaded, 404'd, and the
 * app answered "I could not make out the words" — so the player tried again, louder, and read the
 * fault as theirs. Unity now separates a missing route (`unavailable`) from a failed take
 * (`upstream`), and the room stops offering a gesture that is guaranteed to fail.
 */
test('a server with no transcription route stops being offered the microphone', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  expect(engine.getState().mic.offered).toBe(true);

  engine.startMic();
  engine.onMicState('listening', 0.05);
  engine.stopMic();
  engine.onMicResult({ ok: false, text: '', error: 'unavailable' });

  expect(engine.getState().mic.error).toBe('unavailable');
  expect(engine.getState().mic.offered).toBe(false);
  // Losing the mic must not lose the turn: the room stays in the chat loop, keyboard and all.
  expect(engine.getState().screen).toBe('loop');

  // And it stays withdrawn: the route does not come back mid-session.
  engine.startMic();
  engine.onMicResult({ ok: true, text: '올해 이직해도 될까요', error: '' });
  expect(engine.getState().mic.offered).toBe(false);
});

/** A take that merely failed is worth another try, so the button stays. */
test('a failed take does not withdraw the microphone', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  engine.startMic();
  engine.onMicState('listening', 0.05);
  engine.onMicResult({ ok: false, text: '', error: 'upstream' });
  expect(engine.getState().mic.error).toBe('upstream');
  expect(engine.getState().mic.offered).toBe(true);
});

test('a spoken question is asked as if it had been typed, and carries the interruption', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: [LONG_ANSWER] }],
  });
  const heard = '어머나, 정말 재미있는 사주네요!';

  engine.startMic();
  // Stop means "I have finished speaking", so it only applies once the device is actually
  // recording — a tap while the permission dialog is still up is a cancel, not a take.
  engine.stopMic();
  expect(stage.micCalls).toEqual(['start:ko']);
  engine.onMicState('listening', 0.05);
  engine.stopMic();
  expect(stage.micCalls).toEqual(['start:ko', 'stop']);
  engine.onMicResult({ ok: true, text: '  올해 이직해도 될까요  ', error: '' });

  const asked = stage.asks[stage.asks.length - 1];
  expect(asked.question).toBe('올해 이직해도 될까요');
  expect(asked.interrupted).toBe(heard);
  expect(engine.getState().mic.state).toBe('idle');
});

/**
 * The suggestion chip belongs to the counselor until she has finished; the text box does not.
 *
 * Reported from a real session: the player asked a question, one short line appeared, the
 * suggestion chip was live, they tapped it — and the long answer arrived AFTER their next question,
 * unspoken. The chip is the trap, because it fires a whole question on one tap with no intent
 * behind it. Typing, or holding the mic, is intent — and since 15-09-2026 cutting in is something
 * the room is meant to ALLOW. So the box opens with her voice and only the chip waits.
 */
test('the chip waits for her to finish, but the box is open for cutting in', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  engine.onOracleResult({
    ok: true, followup: '다음 질문',
    beats: [
      { phaseId: 'P11', lines: ['하나'] }, { phaseId: 'P14', lines: ['둘'] },
      { phaseId: 'P17', lines: ['셋'] }, { phaseId: 'P19', lines: ['넷'] },
    ],
  });
  sched.advance(300_000);

  // Hold the answer's own takes so the walk advances only when this test says so.
  stage.holdPrefix = 'loop_1.';
  engine.submitQuestion('추가 질문');

  const long =
    '지금 이직 자체는 괜찮아. 다만 올해는 관성이 강해서 책임이 먼저 커지는 흐름이야. ' +
    '수입은 그 뒤를 따라오니 조건을 문서로 남겨야 해. 서두르면 지출이 같이 커진다. ' +
    '가을 무렵에 한 번 더 점검하면 좋겠어. 그때 다시 이야기해 보자.';
  engine.onOracleResult({
    ok: true, loop: true, followup: '또 다른 질문',
    beats: [{ phaseId: 'loop', lines: [long] }],
  });

  const chunkKeys = () => stage.spoken.filter(k => k.startsWith('loop_1.'));
  expect(chunkKeys().length).toBe(1);          // she has started, and only started
  expect(engine.getState().inputEnabled).toBe(true);   // they may cut in
  expect(engine.getState().speaking).toBe(true);       // and the UI can tell she is mid-answer
  expect(engine.getState().suggestion).toBe('');
  expect(engine.getState().pending).toBe(false); // the WAITING is over; the turn is not

  // Walk the rest of the answer, checking the CHIP stays away on every chunk but the last.
  for (let guard = 0; guard < 20; guard++) {
    const before = chunkKeys().length;
    engine.onSpeakDone(chunkKeys()[before - 1]);
    if (chunkKeys().length === before) break;   // nothing new started: that was the last one
    expect(engine.getState().suggestion).toBe('');
  }

  expect(engine.getState().inputEnabled).toBe(true);
  expect(engine.getState().suggestion).toBe('또 다른 질문');
  expect(engine.getState().speaking).toBe(false);
});

/**
 * `speak()` has no timeout — it hands a take to Unity and waits for SPEAK_DONE, and TTS degrades to
 * silence rather than to an error. Holding the turn until she finishes means a take that is never
 * reported would leave the player at a dead text box, so the walk carries a deadline.
 */
test('a take that never reports still gives the turn back', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  engine.onOracleResult({
    ok: true, followup: '다음 질문',
    beats: [
      { phaseId: 'P11', lines: ['하나'] }, { phaseId: 'P14', lines: ['둘'] },
      { phaseId: 'P17', lines: ['셋'] }, { phaseId: 'P19', lines: ['넷'] },
    ],
  });
  sched.advance(300_000);

  stage.holdPrefix = 'loop_1.';
  engine.submitQuestion('추가 질문');
  const long = '한 문장. 두 번째 문장이고 조금 더 길다. 세 번째 문장은 여기서 끝난다.';
  engine.onOracleResult({
    ok: true, loop: true, followup: '또 다른 질문',
    beats: [{ phaseId: 'loop', lines: [long] }],
  });

  expect(engine.getState().suggestion).toBe('');

  // Nobody ever calls onSpeakDone. The guard is the only thing left.
  sched.advance(120_000);

  expect(engine.getState().suggestion).toBe('또 다른 질문');
  expect(engine.getState().inputEnabled).toBe(true);
  // And the rest of what she was saying is on screen rather than lost.
  const transcript = engine.getState().transcript;
  expect(transcript[transcript.length - 1].text).toContain('세 번째 문장은 여기서 끝난다.');
});

/**
 * Changing language mid-consultation must change what is on screen.
 *
 * It deliberately does not restart the session — and for a long time that meant it did not redraw
 * anything either. Switching to Chinese left the English speaker and line exactly where they were,
 * above a bubble that had fallen back to Korean, above a "tap to continue" that WAS Chinese: three
 * languages on one card, none of them a translation bug.
 */
test('switching language redraws the card that is already on screen', () => {
  const { sched, engine } = build();
  engine.begin();
  sched.advance(60_000);

  const ko = engine.getState();
  expect(ko.speaker).toBe('상담사');

  engine.setLang('en');
  const en = engine.getState();
  expect(en.speaker).toBe('Counselor');
  expect(en.line).not.toBe(ko.line);
  // Same place in the walk — a language change is not a restart.
  expect(en.phaseId).toBe(ko.phaseId);
  expect(en.screen).toBe(ko.screen);

  engine.setLang('ko');
  expect(engine.getState().speaker).toBe('상담사');
});

/**
 * The room speaks all six languages the app ships.
 *
 * It carried ko/en/vi for a long time, because it is generated from Unity's LocalizationData.asset
 * and that asset had three columns. `loc` walks lang → ko → en, so a Chinese player got a Korean
 * consultation — including the shape hint that is appended to the question, which is how a Korean
 * instruction ended up steering the model's reply language too.
 *
 * This is the test that would have caught it: not "does the fallback behave" but "is there anything
 * to fall back FROM".
 */
test('the room speaks every language the app offers', () => {
  const langs: Lang[] = ['ko', 'en', 'vi', 'ja', 'zh-CN', 'zh-TW'];
  const seen = new Map<Lang, string>();

  for (const lang of langs) {
    const { sched, engine } = build();
    engine.begin();
    sched.advance(60_000);
    engine.setLang(lang);
    const s = engine.getState();
    expect(s.speaker).not.toBe('');
    expect(s.line).not.toBe('');
    seen.set(lang, s.speaker + '␟' + s.line);
  }

  // Six distinct renderings — a language that silently resolved to another's text would collide
  // here, which is exactly the failure this replaces.
  expect(new Set(seen.values()).size).toBe(langs.length);
});

/** A language change must not make the counselor say her line a second time. */
test('switching language does not re-speak the line', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);

  const before = stage.spoken.length;
  engine.setLang('en');
  expect(stage.spoken.length).toBe(before);
});

/* ── The server's scene break-up, once it reaches a phase ───────────────────
 *
 * Only the RN path carries these: the embedded room answers over v2, which speaks `[Beat]` cues and
 * has no scenes, so every assertion below has a partner that pins the untagged behaviour unchanged.
 */

/** Three sentences, ~190 characters — comfortably past the 110 the local splitter packs to. */
const LONG_SCENE =
  '올해의 큰 흐름부터 봅니다. 재물의 자리가 움직이는 해라 들어오는 돈도 나가는 돈도 함께 커집니다. ' +
  '그래서 버는 것보다 남기는 쪽에 손을 써야 하는 한 해입니다.';

test('a scene is spoken whole — the server broke the answer, not the character counter', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  sched.advance(120_000);
  // Hold the takes so the beat stops after its first chunk and can be read.
  stage.holdPrefix = 'P11';

  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [
      {
        phaseId: 'P11',
        lines: [LONG_SCENE],
        scenes: [{ text: LONG_SCENE, tone: 'analysis', emotion: 'thinking', animation: 'thinking' }],
      },
    ],
  });
  sched.advance(2_000);

  // One scene, one chunk: the whole thing is on the card and being said in one take.
  expect(engine.getState().line).toBe(LONG_SCENE);
  expect(stage.spoken.filter(k => k.startsWith('P11#'))).toEqual(['P11#0']);
});

test('the same beat without scenes is still packed by the local splitter', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  sched.advance(120_000);
  stage.holdPrefix = 'P11';

  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [{ phaseId: 'P11', lines: [LONG_SCENE] }],
  });
  sched.advance(2_000);

  // The heuristic cuts it: the card opens on one sentence, with more to come.
  expect(engine.getState().line.length).toBeLessThan(LONG_SCENE.length);
  expect(engine.getState().line).toBe('올해의 큰 흐름부터 봅니다.');
});

test('the face follows the scene being spoken, and lets go of it afterwards', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  sched.advance(120_000);
  stage.holdPrefix = 'P11';

  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [
      {
        phaseId: 'P11',
        lines: ['먼저 흐름을 봅니다.', '여기서 한 번 걸립니다.'],
        scenes: [
          { text: '먼저 흐름을 봅니다.', tone: 'analysis', emotion: 'thinking', animation: 'thinking' },
          { text: '여기서 한 번 걸립니다.', tone: 'concerned', emotion: 'concerned', animation: 'concern' },
        ],
      },
    ],
  });
  sched.advance(2_000);

  expect(engine.getState().tone).toBe('analysis');
  expect(engine.getState().emotion).toBe('thinking');

  // The take finishes; the next scene brings its own direction with it.
  engine.onSpeakDone('P11#0');
  expect(engine.getState().line).toContain('여기서 한 번 걸립니다.');
  expect(engine.getState().tone).toBe('concerned');
  expect(engine.getState().emotion).toBe('concerned');

  // And an authored phase afterwards is not left wearing it: that copy was never directed.
  stage.holdPrefix = null;
  engine.onSpeakDone('P11#1');
  sched.advance(120_000);
  expect(engine.getState().tone).toBe('');
  expect(engine.getState().emotion).toBe('neutral');
});

test('an untagged reading leaves the face flat, as it always did', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);
  engine.submitQuestion('질문');
  sched.advance(120_000);
  stage.holdPrefix = 'P11';

  engine.onOracleResult({
    ok: true,
    followup: '',
    beats: [{ phaseId: 'P11', lines: ['먼저 흐름을 봅니다.'] }],
  });
  sched.advance(2_000);

  expect(engine.getState().tone).toBe('');
  expect(engine.getState().emotion).toBe('neutral');
});

/* ── Opening with what she remembers (26-08 steps 18-19) ──────────────────── */

test('the remembered opening replaces the authored welcome, and is spoken as words', () => {
  const { sched, stage, engine } = build();
  engine.setRecallOpening('지난번에 「이직해도 될까요」 하고 물으셨지요. 그 뒤로 어떻게 되었나요?');
  engine.begin();
  sched.advance(60_000);

  // Said by TTS, not by a recorded take: it is the server's sentence, not an asset's.
  expect(stage.spokenText.some(t => t.includes('이직해도 될까요'))).toBe(true);
  // ...and it went out under P02's key, so the walk's pacing is untouched.
  expect(stage.spoken).toContain('P02#0');
  expect(stage.spoken).not.toContain('P02');
});

test('a first visit still plays the authored welcome', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000);

  expect(stage.spoken).toContain('P02');
  expect(stage.spokenText.join(' ')).not.toContain('지난번');
});

test('a memory that arrives after the welcome is dropped rather than interrupting', () => {
  const { sched, stage, engine } = build();
  engine.begin();
  sched.advance(60_000); // walks past P02 to the question box

  engine.setRecallOpening('지난번에 「이직해도 될까요」 하고 물으셨지요.');
  sched.advance(60_000);

  expect(stage.spokenText.join(' ')).not.toContain('이직해도 될까요');
});

/* ── Pacing: the scene stands for as long as the server asked ─────────────── */

const PACED_BEAT = {
  phaseId: 'loop',
  lines: ['첫 줄이에요. 둘째 줄이에요.'],
  scenes: [
    { text: '첫 줄이에요.', tone: 'reveal', emotion: 'surprised' as const, animation: 'talk' as const, holdMs: 3000 },
    { text: '둘째 줄이에요.', tone: 'calm', emotion: 'neutral' as const, animation: 'talk' as const, holdMs: 1000 },
  ],
};

test('a scene the voice rushes is still held for its hold_ms before the next one', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  engine.onOracleResult({ ok: true, loop: true, followup: '', beats: [PACED_BEAT] });
  expect(stage.spokenText).toContain('첫 줄이에요.');

  // The synthesiser was quick — but the scene is owed three seconds on screen.
  engine.onSpeakDone('loop_1.0');
  expect(stage.spokenText).not.toContain('둘째 줄이에요.');

  sched.advance(2_900);
  expect(stage.spokenText).not.toContain('둘째 줄이에요.');

  sched.advance(200);
  expect(stage.spokenText).toContain('둘째 줄이에요.');
});

test('a tap during the hold gets on with it', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  engine.onOracleResult({ ok: true, loop: true, followup: '', beats: [PACED_BEAT] });
  engine.onSpeakDone('loop_1.0');
  // Barging in mid-pause must not leave a timer behind that speaks into the interruption.
  engine.hush();
  sched.advance(10_000);

  expect(stage.spokenText).not.toContain('둘째 줄이에요.');
  expect(engine.getState().inputEnabled).toBe(true);
});

test('without scenes nothing waits — the old pacing is untouched', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: ['첫 줄이에요. 둘째 줄이에요. 셋째 줄이에요.'] }],
  });
  engine.onSpeakDone('loop_1.0');

  // No clock advance was needed to get there — the second scene followed the first immediately.
  expect(stage.spokenText.join(' ')).toContain('둘째');
});

test('a cue pause is a breath BEFORE the line, not a hold after it', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  // What the embedded room sends: no hold_ms (that is the prayers path), a lead from `[Beat] pause=`.
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [
      {
        phaseId: 'loop',
        lines: ['첫 줄이에요. 둘째 줄이에요.'],
        scenes: [
          { text: '첫 줄이에요.', tone: 'neutral', emotion: 'neutral' as const, animation: 'talk' as const },
          { text: '둘째 줄이에요.', tone: 'serious', emotion: 'thinking' as const, animation: 'talk' as const, leadMs: 1200 },
        ],
      },
    ],
  } as any);

  engine.onSpeakDone('loop_1.0');
  expect(stage.spokenText).not.toContain('둘째 줄이에요.');

  sched.advance(1_100);
  expect(stage.spokenText).not.toContain('둘째 줄이에요.');

  sched.advance(200);
  expect(stage.spokenText).toContain('둘째 줄이에요.');
});

/**
 * The branch a session STARTS in — the counsellor card already chose it.
 *
 * Every per-topic variant keys off `branches`, and `presetTopic` used to set only the label. So a
 * session opened from a card ran the phase DEFAULTS, which are the wealth ones: Theo, whose card
 * reads relationships, asked where the player's heart stood and then offered "start a business".
 */
describe('the topic the app already picked', () => {
  const flow = require('../src/features/counseling/flow/consultationFlow.json');
  /**
   * The real phase, under a different id.
   *
   * ⚠️ `SKIP_PHASES` drops P12 by id, so even a one-phase engine shows nothing for it. Renaming
   * keeps the DATA under test (its variants, its choices, its lines) while stepping out of the way
   * of a skip that is about the walk, not about branching.
   */
  const phase = (id: string) =>
    flow.phases
      .filter((p: { id: string }) => p.id === id)
      .map((p: object) => ({ ...JSON.parse(JSON.stringify(p)), id: 'PX' }));

  /**
   * ⚠️ P12 IS SKIPPED IN THE LIVE WALK. `SKIP_PHASES` drops the in-room pickers because the app
   * asks for the topic on the way in ("talk-first"), so this drives the phase on its own rather
   * than walking to somewhere the walk no longer goes. What is under test is the BRANCHING, which
   * is latent until those pickers come back — and which was wrong in a way nothing would report.
   */
  function at(phaseId: string, topic: string) {
    const sched = new FakeScheduler();
    const stage = new StageDouble();
    const engine = new ConsultationEngine({
      stage, lang: 'ko', scheduler: sched, presetTopic: topic, phases: phase(phaseId),
    });
    stage.bind(engine);
    stage.autoFinishSpeech = true;
    engine.begin();
    sched.advance(30_000);
    return engine.getState();
  }

  it('seeds the branch, so P12 asks the relationship question and offers relationship answers', () => {
    const st = at('P12', 'relationships');
    expect(st.line).toContain('사이');
    const labels = st.choices.map(c => c.label).join(' ');
    expect(labels).not.toContain('창업');   // the wealth set
    expect(labels).not.toContain('투자');
    expect(st.choices.map(c => c.choice.branchTag)).toEqual([
      'plan:rel_family', 'plan:rel_work', 'plan:rel_friend', 'plan:rel_distance',
    ]);
  });

  it('a love session gets the love answers, not the money ones', () => {
    expect(at('P12', 'love').choices.map(c => c.choice.branchTag)).toEqual([
      'plan:love_single', 'plan:love_seeing', 'plan:love_commit', 'plan:love_healing',
    ]);
  });

  it('with no preset topic the phase keeps its own wealth answers', () => {
    expect(at('P12', '').choices.map(c => c.choice.branchTag)).toEqual([
      'plan:business', 'plan:invest', 'plan:side', 'plan:none',
    ]);
  });
});

describe('the flow asset', () => {
  const flow = require('../src/features/counseling/flow/consultationFlow.json');
  const strings = require('../src/features/counseling/flow/consultationStrings.json');

  it('has no variant that no answer can reach', () => {
    const settable = new Set<string>();
    for (const p of flow.phases) {
      for (const c of p.choices ?? []) settable.add(c.branchTag);
      for (const v of p.variants ?? []) for (const c of v.choices ?? []) settable.add(c.branchTag);
    }
    // A topic branch is also seeded by the card the player came in from.
    for (const topic of ['wealth', 'love', 'business', 'career', 'health', 'relationships']) {
      settable.add('topic:' + topic);
    }
    const unreachable: string[] = [];
    for (const p of flow.phases) {
      for (const v of p.variants ?? []) if (!settable.has(v.branchTag)) unreachable.push(p.id + ' ' + v.branchTag);
    }
    expect(unreachable).toEqual([]);
  });

  it('says every line and every answer in all six languages', () => {
    const missing: string[] = [];
    const short: string[] = [];
    const check = (key: string) => {
      if (!key) return;
      const row = (strings as Record<string, Record<string, string>>)[key];
      if (!row) { missing.push(key); return; }
      for (const lang of ['ko', 'en', 'vi', 'ja', 'zh-CN', 'zh-TW']) {
        if (!row[lang]) short.push(key + ':' + lang);
      }
    };
    for (const p of flow.phases) {
      (p.lineLocKeys ?? []).forEach(check);
      for (const c of p.choices ?? []) check(c.locKey);
      for (const v of p.variants ?? []) {
        (v.lineLocKeys ?? []).forEach(check);
        for (const c of v.choices ?? []) check(c.locKey);
      }
    }
    expect({ missing, short }).toEqual({ missing: [], short: [] });
  });
});

/**
 * Talk-first is UNIFORM. Every counsellor gets one question box and one answer — no in-room
 * pickers, whatever the topic.
 *
 * ⚠️ This test exists because the exception was built and then taken out again (17-09). The branch
 * content for relationships is still in the asset and still correct; what was decided is that the
 * player should not be asked a second question inside the room. If that is ever reversed, this is
 * the test that will go red first, and it should be edited deliberately rather than deleted.
 */
describe('the walk is the same for every counsellor', () => {
  function walk(topic: string) {
    const sched = new FakeScheduler();
    const stage = new StageDouble();
    const engine = new ConsultationEngine({ stage, lang: 'ko', scheduler: sched, presetTopic: topic });
    stage.bind(engine);
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
    for (let i = 0; i < 60 && engine.getState().screen !== 'loop'; i++) {
      const st = engine.getState();
      if (st.choices.length > 0) engine.choose(st.choices[0].choice);
      sched.advance(20_000);
    }
    return { sched, stage, engine };
  }

  it.each(['relationships', 'love', 'wealth', 'career'])(
    'a %s session never stops at the in-room pickers',
    topic => {
      const ids = walk(topic).stage.phaseIds;
      for (const skipped of ['P03', 'P04', 'P12', 'P13', 'P15', 'P16', 'P18']) {
        expect(ids).not.toContain(skipped);
      }
    },
  );

  it('still reaches the free chat, one AI turn spent', () => {
    const { engine, stage } = walk('relationships');
    expect(engine.getState().screen).toBe('loop');
    expect(stage.asks).toHaveLength(1);
  });
});

/**
 * A wait that outlives its own line.
 *
 * The room says "one moment" once and then nothing moves for fifteen to forty-five seconds, which
 * is where waiting stops reading as thinking and starts reading as a hang. The cover comes in
 * tiers: the line is replaced IN PLACE (a second bubble would look like she had answered), and the
 * camera pushes in once when even that has stopped being news.
 */
test('a long wait swaps its line in place, and pushes the camera in once', () => {
  const { sched, stage, engine } = build();
  intoLoop(stage, engine, sched);

  const before = engine.getState().transcript.length;
  engine.submitQuestion('올해 이직해도 될까요');

  // Her question is in, and the one spoken waiting line under it.
  const rows = engine.getState().transcript.length;
  expect(rows).toBe(before + 2);
  const first = engine.getState().transcript[rows - 1].text;
  expect(first.length).toBeGreaterThan(0);

  // Nothing happens for the first few seconds: a line replaced at once would be a flicker.
  sched.advance(7_000);
  expect(engine.getState().transcript[rows - 1].text).toBe(first);
  expect(engine.getState().transcript).toHaveLength(rows);

  // 8s: new words, SAME bubble.
  sched.advance(1_500);
  const second = engine.getState().transcript[rows - 1].text;
  expect(second).not.toBe(first);
  expect(engine.getState().transcript).toHaveLength(rows);

  // ...and nothing new was spoken for it: a take started mid-wait would still be playing when the
  // answer arrives.
  const spokenAfterSwap = stage.spoken.length;
  sched.advance(6_000);
  expect(stage.spoken.length).toBe(spokenAfterSwap);

  // 20s: one push-in, and only one.
  const shots = () => stage.phases.filter(p => p.phaseId === 'LOOP_WAIT_LONG').length;
  expect(shots()).toBe(0);
  sched.advance(8_000);
  expect(shots()).toBe(1);
  sched.advance(30_000);
  expect(shots()).toBe(1);

  // The answer ends the cover: no swap may land on top of it.
  engine.onOracleResult({ ok: true, loop: true, followup: '', beats: [{ phaseId: 'loop', lines: ['답이에요.'] }] });
  const answered = engine.getState().transcript.length;
  sched.advance(30_000);
  expect(engine.getState().transcript.length).toBeGreaterThanOrEqual(answered);
  expect(engine.getState().transcript[engine.getState().transcript.length - 1].text).toContain('답이에요');
});

test('a loop turn carries the answer style the room has picked, and the reading does not', () => {
  const sched = new FakeScheduler();
  const stage = new StageDouble();
  let mode: 'tiki' | 'detail' = 'detail';
  const engine = new ConsultationEngine({
    stage,
    lang: 'ko',
    scheduler: sched,
    chatMode: () => mode,
  });
  stage.bind(engine);
  intoLoop(stage, engine, sched);

  // The staged reading keeps the room's numbered shape whatever the segment says.
  expect(stage.asks[0].loop).toBeUndefined();
  expect(stage.asks[0].chatMode).toBeUndefined();

  engine.submitQuestion('올해는요?');
  expect(stage.asks[stage.asks.length - 1]).toMatchObject({ loop: true, chatMode: 'detail' });
  engine.onOracleResult({
    ok: true,
    loop: true,
    followup: '',
    beats: [{ phaseId: 'loop', lines: ['답.'] }],
  });
  sched.advance(60_000);

  // Flipped mid-session: the NEXT question goes out in the new style, not the next session.
  mode = 'tiki';
  engine.submitQuestion('그럼 내년은요?');
  expect(stage.asks[stage.asks.length - 1]).toMatchObject({ loop: true, chatMode: 'tiki' });
});

/* ── Chat-first rooms (the pixel cat) ───────────────────────────────────────── */

describe('a chat-first room', () => {
  function chatFirst(opts: { voice?: 'cat' } = {}) {
    const sched = new FakeScheduler();
    const stage = new StageDouble();
    const engine = new ConsultationEngine({
      stage,
      lang: 'ko',
      scheduler: sched,
      chatFirst: true,
      voice: opts.voice,
      chatMode: () => 'auto',
    });
    stage.bind(engine);
    return { engine, stage, sched };
  }

  it('skips the staged reading and greets straight into free chat', () => {
    const { engine, stage, sched } = chatFirst({ voice: 'cat' });
    engine.begin();
    sched.advance(1500);
    const s = engine.getState();
    expect(s.screen).toBe('loop');
    expect(s.inputEnabled).toBe(true);
    expect(s.line).toContain('냥');
    // No scripted phase was staged — only the loop's own opening beat.
    expect(stage.phaseIds).toEqual(['LOOP_OPEN']);
  });

  it('asks the server on the very first question, in the pinned style', () => {
    const { engine, stage, sched } = chatFirst();
    engine.begin();
    sched.advance(1500);
    engine.submitQuestion('요즘 일이 너무 많아');
    expect(stage.asks).toHaveLength(1);
    expect(stage.asks[0].loop).toBe(true);
    expect(stage.asks[0].chatMode).toBe('auto');
  });

  it('opens with the memory of last time when it arrives in the grace window', () => {
    const { engine, sched } = chatFirst();
    engine.begin();
    sched.advance(300);
    engine.setRecallOpening('지난번엔 이직 이야기를 했었죠.');
    expect(engine.getState().line).toBe('지난번엔 이직 이야기를 했었죠.');
    // …and a late one never interrupts a conversation already under way.
    const late = chatFirst();
    late.engine.begin();
    late.sched.advance(1500);
    late.engine.setRecallOpening('늦은 기억');
    expect(late.engine.getState().line).not.toBe('늦은 기억');
  });
});
