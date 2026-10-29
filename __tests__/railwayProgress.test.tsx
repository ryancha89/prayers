/**
 * The station rail under the journey panel. 29-10, SE 3 sideways: the side panel left eight stations
 * ~30 pt each and their name chips piled on one another. Narrower than a chip, the rail goes compact:
 * one name (the current station), the rest dots — every one still a button.
 *
 * 29-10, later: the first threshold sent every upright iPhone compact, and the one name — an opaque
 * 110 pt button — hid the neighbours' locks and caught their taps (restarting the current station).
 * Widths below are the rail's real width (screen - 2 × 32 pt margin): SE upright 311, iPhone 15
 * upright 329, SE sideways side panel ~240.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { RailwayProgress } from '../src/features/journey/components/RailwayProgress';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import type { JourneyContent } from '../src/features/journey/types';

const chapters = NEWYEAR_2027.chapters;
const drawn = chapters.filter(c => !c.hideOnRail);
const last = drawn.length - 1;

/** Every drawn station sells one moment, none bought: each one shows a lock. */
const allLocked: JourneyContent = {
  journey: 'newyear-2027', year: 2027, counselor: 'yuna',
  chapters: drawn.map(c => ({ id: c.id, narration: '', cards: [], parts: [{ momentId: `${c.id}#0`, unlocked: false } as never] })),
  summary: {} as never,
};

function mount(width: number, current = 1, content?: JourneyContent) {
  const onStation = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<RailwayProgress chapters={chapters} current={current} progress={0} content={content} onStation={onStation} />); });
  const rail = tree.root.findAll(n => n.props.testID === 'railway' && typeof n.props.onLayout === 'function')[0];
  act(() => rail.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 50 } } }));
  return { tree, onStation };
}

const titles = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 1);
const nameLabel = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props.testID === 'railway-now' && typeof n.type === 'string');
const stops = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
/** The style a slot was given (Pressable's function style, resolved unpressed). */
function flat(style: unknown): Record<string, number> {
  const s = typeof style === 'function' ? style({ pressed: false }) : style;
  return Object.assign({}, ...(Array.isArray(s) ? s.flat(3) : [s]).filter(Boolean));
}

it('a wide rail names every station', () => {
  const { tree } = mount(900);
  expect(nameLabel(tree)).toHaveLength(0);
  expect(titles(tree)).toHaveLength(drawn.length);
});

it.each([
  ['iPhone 15 upright', 329],
  ['SE upright', 311],
])('%s (%i pt) names every station, and no two chips overlap', (_, width) => {
  const { tree } = mount(width);
  expect(nameLabel(tree)).toHaveLength(0);
  expect(titles(tree)).toHaveLength(drawn.length);
  const w = flat(stops(tree)[0].props.style).width;
  expect(w).toBeLessThanOrEqual(width / last);
  expect(w).toBeGreaterThanOrEqual(45);
});

it('SE sideways (240 pt): one name, every dot still travels', () => {
  const { tree, onStation } = mount(240, 2);
  const now = nameLabel(tree);
  expect(now).toHaveLength(1);
  expect(titles(tree)).toHaveLength(1);
  const s = flat(now[0].props.style);
  expect(s.left).toBeGreaterThanOrEqual(-32);
  expect(s.left + s.width).toBeLessThanOrEqual(240 + 32);
  const all = stops(tree);
  expect(all).toHaveLength(drawn.length);
  act(() => all[all.length - 1].props.onPress());
  expect(onStation).toHaveBeenLastCalledWith(chapters.indexOf(drawn[last]));
});

it('SE sideways: the name is not a button and stops short of the neighbours\' locks', () => {
  const width = 240;
  const spacing = width / last;
  for (const current of [0, 2, last]) {
    const { tree } = mount(width, current, allLocked);
    const now = nameLabel(tree)[0];
    // Taps go through it to the slots underneath; it catches none of its own.
    expect(now.props.pointerEvents).toBe('none');
    expect(now.props.onPress).toBeUndefined();
    const { left, width: w } = flat(now.props.style);
    const x = (current / last) * width;
    // Each neighbour's lock (9 pt, centred on its dot) stays clear of the name.
    if (current > 0) expect(left).toBeGreaterThanOrEqual(x - spacing + 4.5);
    if (current < last) expect(left + w).toBeLessThanOrEqual(x + spacing - 4.5);
    // Every other station keeps its lock.
    expect(tree.root.findAll(n => n.props.testID === 'railway-lock' && typeof n.type === 'string')).toHaveLength(last);
  }
});

it('SE sideways: the dot slots tile the rail without overlapping, slop included', () => {
  const { tree } = mount(240, 2);
  const s = stops(tree)[0];
  expect(flat(s.props.style).width).toBeCloseTo(240 / last);
  expect(s.props.hitSlop).toMatchObject({ left: 0, right: 0 });
});
