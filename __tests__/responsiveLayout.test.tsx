/**
 * The room UI has to fit the phone it is on.
 *
 * Every panel in the consultation overlay used to be a constant measured on one device. Added up,
 * the transcript (320), the dialogue card (220) and the input (110) claim 650pt — more than an
 * iPhone SE has (667) before its keyboard takes ~300 of them, which is how the counselor ended up
 * hidden behind her own subtitles. These tests pin the two ends of the range so the constants
 * cannot come back: a share of the window, floored so a panel stays usable and capped so the
 * original design is still the maximum.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ConsultationOverlay } from '../src/features/counseling/components/ConsultationOverlay';
import { Text, TextInput, MAX_FONT_SCALE } from '../src/shared/components/Text';
import type { FlowState } from '../src/features/counseling/flow/engine';

const SE = { width: 375, height: 667, scale: 2, fontScale: 1 };
const PRO_MAX = { width: 440, height: 956, scale: 3, fontScale: 1 };

const state: FlowState = {
  phaseId: 'PLOOP',
  screen: 'loop',
  speaker: '상담사',
  line: '',
  choices: [],
  canTap: false,
  inputEnabled: true,
  notice: null,
  report: null,
  tone: '',
  emotion: 'neutral',
  transcript: [
    { role: 'counselor', text: '어서 오세요.' },
    { role: 'user', text: '안녕하세요.' },
  ],
  suggestion: '',
  topic: '',
  finished: false,
  pending: false,
  speaking: false,
  mic: { state: 'idle', level: 0, error: '', offered: true },
};

const noop = () => {};

/** Every maxHeight the overlay puts on a node, in render order. */
function maxHeights(window: typeof SE): number[] {
  const spy = jest
    .spyOn(Dimensions, 'get')
    .mockImplementation(() => window as never);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ConsultationOverlay
        state={state}
        onTap={noop}
        onChoose={noop}
        onSubmit={noop}
        onRetry={noop}
        onLeave={noop}
      />,
    );
  });
  const found: number[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = node.props?.style;
    const flat = Array.isArray(style) ? style : [style];
    for (const s of flat)
      if (s && typeof s.maxHeight === 'number') found.push(s.maxHeight);
    (node.children ?? []).forEach(walk);
  };
  walk(tree.toJSON());
  ReactTestRenderer.act(() => tree.unmount());
  spy.mockRestore();
  return found;
}

describe('consultation overlay heights follow the window', () => {
  it('fits a small phone: the panels leave room for the counselor and the keyboard', () => {
    const heights = maxHeights(SE);
    expect(heights.length).toBeGreaterThan(0);
    const total = heights.reduce((a, b) => a + b, 0);
    // The old constants totalled 650 of 667. Half the screen is the budget now.
    expect(total).toBeLessThanOrEqual(SE.height * 0.5);
    // ...and no panel collapsed to something unreadable.
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(72);
  });

  it('does not grow past the measured design on a large phone', () => {
    const heights = maxHeights(PRO_MAX);
    for (const h of heights) expect(h).toBeLessThanOrEqual(320);
    // A tall phone really does get more than a short one.
    expect(Math.max(...heights)).toBeGreaterThan(Math.max(...maxHeights(SE)));
  });
});

describe('OS text scaling is capped', () => {
  it('Text and TextInput carry the cap by default', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <>
          <Text>hello</Text>
          <TextInput value="" />
        </>,
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain(`"maxFontSizeMultiplier":${MAX_FONT_SCALE}`);
    expect(tree.toJSON()).toHaveLength(2);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a caller can still override it', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Text maxFontSizeMultiplier={2}>hello</Text>,
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain(
      '"maxFontSizeMultiplier":2',
    );
    ReactTestRenderer.act(() => tree.unmount());
  });
});
