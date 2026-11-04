import { cheeseChapter1 } from '../src/features/story/data/cheeseChapter1';
import {
  advance, answered, historyForServer, initialState, jump, nodeForIntent, progressChoices, run,
  type Shown, type StoryState,
} from '../src/features/story/engine/storyEngine';
import { mapTurn } from '../src/features/story/api/storyApi';
import type { TurnResult } from '../src/features/story/types';

const script = cheeseChapter1('ko');

/** Taps through every beat until the story stops for free talk or ends. */
function playUntilStop(s0: StoryState): { state: StoryState; shown: Shown; seen: string[] } {
  let { state, shown } = run(script, s0);
  const seen: string[] = [];
  while (shown.kind === 'beat') {
    seen.push(`${shown.beat.role}:${shown.beat.text}`);
    ({ state, shown } = run(script, advance(state, shown.beat)));
  }
  return { state, shown, seen };
}

const reply = (intent: TurnResult['intent'], extra: Partial<TurnResult> = {}): TurnResult => ({
  lines: [{ kind: 'action', text: '귀를 한 번 턴다.' }, { kind: 'say', text: '그렇군.' }],
  intent, name: null, mood: 'idle', suggestions: ['a', 'b', 'c'], ...extra,
});

describe('Cheese chapter 1 — the script', () => {
  it('opens at the door, crosses to the sofa and stops for free talk', () => {
    const first = run(script, initialState(script));
    expect(first.state.plate).toBe('door');
    expect(first.shown).toMatchObject({ kind: 'beat', beat: { role: 'narr' } });

    const { state, shown, seen } = playUntilStop(initialState(script));
    expect(shown).toEqual({ kind: 'free', stage: 'arrival' });
    expect(state.plate).toBe('sofa');
    expect(seen).toContain('cat:문부터 닫아라. 찬바람 들어온다.');
    expect(state.suggestions).toEqual(script.stages.arrival.suggestions);
    // every fixed line was logged, in order
    expect(state.log.map(e => `${e.role}:${e.text}`)).toEqual(seen);
  });

  it('plays the optional backstory first when asked', () => {
    const { seen } = playUntilStop(initialState(script, true));
    expect(seen[0]).toMatch(/^narr:울음소리가 들려/);
  });

  it('asks whether he may stay after two plain turns, then waits for the answer', () => {
    let { state } = playUntilStop(initialState(script));
    let out = answered(script, state, reply('none'));
    expect(out.then).toBeNull();
    out = answered(script, out.state, reply('none'));
    expect(out.then).toBe('askStay');
    const asked = playUntilStop(jump(out.state, out.then!));
    expect(asked.seen).toEqual(['cat:그런데 내가 잠깐 여기 머물러도 되겠느냐?']);
    expect(asked.shown).toEqual({ kind: 'free', stage: 'permission' });
    state = asked.state;
    expect(state.turns).toBe(0);
  });

  it('a yes moves to the morning chat, where "다녀올게" appears after a turn', () => {
    const { state } = playUntilStop(initialState(script));
    const out = answered(script, state, reply('stay'));
    expect(out.then).toBe('stayed');
    const morning = playUntilStop(jump(out.state, out.then!));
    expect(morning.shown).toEqual({ kind: 'free', stage: 'morning_ready' });
    expect(morning.state.permission).toBe('granted');
    expect(progressChoices(script, morning.state)).toEqual([]);
    const later = answered(script, morning.state, reply('none'));
    expect(progressChoices(script, later.state).map(p => p.node)).toEqual(['goWork']);
  });

  it('a no sends him outside the door; only an invitation brings him back', () => {
    const { state } = playUntilStop(initialState(script));
    const out = answered(script, state, reply('refuse'));
    expect(out.then).toBe('leave');
    const outside = playUntilStop(jump(out.state, out.then!));
    expect(outside.shown).toEqual({ kind: 'free', stage: 'doorstep' });
    expect(outside.state.plate).toBe('doorstep');
    expect(outside.state.permission).toBe('refused');
    // chatting at the door keeps him there, however many turns
    let s = outside.state;
    for (let i = 0; i < 4; i++) {
      const r = answered(script, s, reply('none'));
      expect(r.then).toBeNull();
      s = r.state;
    }
    expect(progressChoices(script, s)).toEqual([]);
    const back = answered(script, s, reply('invite'));
    expect(back.then).toBe('comeBack');
    const inside = playUntilStop(jump(back.state, back.then!));
    expect(inside.state.plate).toBe('sofa');
    expect(inside.state.permission).toBe('granted');
    expect(inside.shown).toEqual({ kind: 'free', stage: 'morning_ready' });
  });

  it('leaving for work before saying yes says it (EVT-002) and ends on the nap', () => {
    let { state } = playUntilStop(initialState(script));
    state = answered(script, state, reply('none')).state;
    state = answered(script, state, reply('none')).state;
    const choice = progressChoices(script, state);
    expect(choice.map(c => c.label)).toEqual(['다녀올게. 여기 있어도 돼.']);
    const end = playUntilStop(jump(state, choice[0].node));
    expect(end.seen).toContain('me:다녀올게. 여기 있어도 돼.');
    expect(end.seen).toContain('cat:알겠다. 다녀와라. 소파는 내가 지키고 있겠다.');
    expect(end.shown).toEqual({ kind: 'end' });
    expect(end.state.finished).toBe(true);
    expect(end.state.plate).toBe('nap');
    expect(end.state.permission).toBe('granted');
  });

  it('keeps the name the player gives him, and folds his action into his line', () => {
    const { state } = playUntilStop(initialState(script));
    const out = answered(script, state, reply('name', { name: '치즈' }));
    expect(out.state.catName).toBe('치즈');
    expect(out.beats).toEqual([{ role: 'cat', text: '그렇군.', action: '귀를 한 번 턴다.', mood: 'idle' }]);
    expect(out.state.log.slice(-2)).toEqual([
      { role: 'action', text: '귀를 한 번 턴다.' },
      { role: 'cat', text: '그렇군.' },
    ]);
    expect(historyForServer(out.state).slice(-2)).toEqual([
      { role: 'cat', text: '(귀를 한 번 턴다.)' },
      { role: 'cat', text: '그렇군.' },
    ]);
  });

  it('reads meaning per stage', () => {
    const at = (stage: StoryState['stage']) => ({ ...initialState(script), stage });
    expect(nodeForIntent(at('doorstep'), 'refuse')).toBeNull();
    expect(nodeForIntent(at('doorstep'), 'stay')).toBe('comeBack');
    expect(nodeForIntent(at('morning_ready'), 'stay')).toBeNull();
    expect(nodeForIntent(at('morning_ready'), 'refuse')).toBe('leave');
  });

  it('has the same story in English, step for step', () => {
    const en = cheeseChapter1('en');
    expect(Object.keys(en.nodes).sort()).toEqual(Object.keys(script.nodes).sort());
    for (const k of Object.keys(script.nodes)) {
      expect(en.nodes[k].map(s => s.kind)).toEqual(script.nodes[k].map(s => s.kind));
    }
    for (const k of Object.keys(script.stages) as (keyof typeof script.stages)[]) {
      expect(en.stages[k].progress.map(p => p.node)).toEqual(script.stages[k].progress.map(p => p.node));
    }
  });

  it('every jump lands on a node that exists', () => {
    const targets = new Set<string>([script.start, script.prologue!]);
    Object.values(script.nodes).flat().forEach(s => { if (s.kind === 'goto') targets.add(s.node); });
    Object.values(script.stages).forEach(c => {
      c.progress.forEach(p => targets.add(p.node));
      if (c.nudge) targets.add(c.nudge.node);
    });
    ['stayed', 'leave', 'comeBack'].forEach(n => targets.add(n));
    targets.forEach(n => expect(script.nodes[n]).toBeDefined());
  });
});

describe('story turn mapping', () => {
  it('needs something said, and clamps unknown values', () => {
    expect(mapTurn({ lines: [{ kind: 'action', text: '하품' }] })).toBeNull();
    expect(mapTurn({ lines: [{ kind: 'say', text: '왔나.' }], intent: 'dance', mood: 'angry', suggestions: ['x', 3] }))
      .toEqual({ lines: [{ kind: 'say', text: '왔나.' }], intent: 'none', name: null, mood: 'idle', suggestions: ['x'] });
  });
});
