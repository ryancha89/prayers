import {
  BREATH,
  CYCLE_MS,
  MeditationSession,
  SESSION_MS,
  phaseAt,
  stateAt,
} from '../src/features/meditation/session';

/**
 * Ten minutes of breathing, walked in fake time.
 *
 * The pacing IS the feature, and it is the one part of a meditation screen that cannot be checked
 * by looking at it — nobody sits through six hundred seconds to find out whether the last breath
 * lands where the session ends.
 */
class FakeClock {
  t = 0;
  now() {
    return this.t;
  }
}

describe('the breath', () => {
  it('is one long out-breath, not a box', () => {
    // If this ever becomes 4-4-4 someone has quietly turned a calming pattern into a focus drill.
    expect(BREATH.map(s => s.seconds)).toEqual([4, 4, 6]);
    expect(CYCLE_MS).toBe(14_000);
  });

  it('names the phase the player is actually in', () => {
    expect(phaseAt(0).phase).toBe('in');
    expect(phaseAt(3_999).phase).toBe('in');
    expect(phaseAt(4_000).phase).toBe('hold');
    expect(phaseAt(7_999).phase).toBe('hold');
    expect(phaseAt(8_000).phase).toBe('out');
    expect(phaseAt(13_999).phase).toBe('out');
    // ...and comes back round.
    expect(phaseAt(14_000).phase).toBe('in');
  });

  it('runs the phase from empty to full and starts the next one empty', () => {
    expect(phaseAt(0).phaseProgress).toBe(0);
    expect(phaseAt(2_000).phaseProgress).toBeCloseTo(0.5);
    expect(phaseAt(4_000).phaseProgress).toBe(0);
  });
});

describe('the session', () => {
  it('counts down from ten minutes and never shows 0:00 with time left', () => {
    expect(stateAt(0, 'running').remainingSeconds).toBe(600);
    expect(stateAt(599_999, 'running').remainingSeconds).toBe(1);
    expect(stateAt(SESSION_MS, 'running').remainingSeconds).toBe(0);
  });

  it('ends itself', () => {
    expect(stateAt(SESSION_MS - 1, 'running').status).toBe('running');
    expect(stateAt(SESSION_MS, 'running').status).toBe('done');
    // And stays ended rather than wrapping into another ten minutes.
    expect(stateAt(SESSION_MS + 60_000, 'running').progress).toBe(1);
  });

  it('counts whole breaths, which is what the end card says', () => {
    expect(stateAt(CYCLE_MS - 1, 'running').breaths).toBe(0);
    expect(stateAt(CYCLE_MS, 'running').breaths).toBe(1);
    expect(stateAt(SESSION_MS, 'running').breaths).toBe(42);
  });

  it('keeps the time it has done when paused, not the time of day', () => {
    const clock = new FakeClock();
    const s = new MeditationSession(clock);

    s.start();
    clock.t += 4 * 60_000;
    s.pause();

    // A day passes with the app in the background.
    clock.t += 24 * 60 * 60_000;
    expect(s.read().remainingSeconds).toBe(6 * 60);
    expect(s.read().status).toBe('paused');

    s.start();
    clock.t += 60_000;
    expect(s.read().remainingSeconds).toBe(5 * 60);
  });

  it('starts idle, and a reset puts the whole ten minutes back', () => {
    const clock = new FakeClock();
    const s = new MeditationSession(clock);

    expect(s.read().status).toBe('idle');
    s.start();
    clock.t += 90_000;
    s.pause();
    s.reset();

    expect(s.read().status).toBe('idle');
    expect(s.read().remainingSeconds).toBe(600);
  });

  it('ignores a second start rather than jumping the clock', () => {
    const clock = new FakeClock();
    const s = new MeditationSession(clock);

    s.start();
    clock.t += 30_000;
    s.start(); // a double tap on Begin
    clock.t += 30_000;

    expect(s.read().remainingSeconds).toBe(600 - 60);
  });
});
