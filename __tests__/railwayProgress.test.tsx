/**
 * The station rail under the journey panel. 29-10, SE 3 sideways: the side panel left eight stations
 * ~30 pt each and their name chips piled on one another. Narrower than a chip, the rail goes compact:
 * one name (the current station), the rest dots — every one still a button.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { RailwayProgress } from '../src/features/journey/components/RailwayProgress';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';

const chapters = NEWYEAR_2027.chapters;
const drawn = chapters.filter(c => !c.hideOnRail);

function mount(width: number, current = 1) {
  const onStation = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<RailwayProgress chapters={chapters} current={current} progress={0} onStation={onStation} />); });
  const rail = tree.root.findAll(n => n.props.testID === 'railway' && typeof n.props.onLayout === 'function')[0];
  act(() => rail.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 50 } } }));
  return { tree, onStation };
}

it('a wide rail names every station', () => {
  const { tree } = mount(900);
  expect(tree.root.findAll(n => n.props.testID === 'railway-now')).toHaveLength(0);
  const named = tree.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityRole === 'button');
  expect(named.length).toBe(drawn.length);
});

it('a narrow rail (SE sideways) names only the current station, and every dot still travels', () => {
  const { tree, onStation } = mount(200, 2);
  const now = tree.root.findAll(n => n.props.testID === 'railway-now' && typeof n.props.onPress === 'function');
  expect(now).toHaveLength(1);
  // The name chip's left edge stays within the rail's 32 pt margins.
  const left = (now[0].props.style as Array<{ left?: number }>).find(s => s && 'left' in s)!.left!;
  expect(left).toBeGreaterThanOrEqual(-32);
  expect(left + 110).toBeLessThanOrEqual(200 + 32);
  // One title text on the rail, not eight.
  const titles = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 1);
  expect(titles.length).toBe(1);
  // The wide rail, for comparison, writes every name.
  expect(mount(900).tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 1).length).toBe(drawn.length);
  const stops = tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.testID !== 'railway-now' && typeof n.props.onPress === 'function');
  act(() => stops[stops.length - 1].props.onPress());
  expect(onStation).toHaveBeenCalled();
});
