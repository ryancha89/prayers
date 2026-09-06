/**
 * The overlay actually draws what the engine says.
 *
 * The engine tests prove the walk is right; this proves the surface that
 * replaced Unity's canvas renders each of its five modes. Between them they
 * cover the seam the whole change hangs on — a phase state going in, the text
 * the player reads coming out.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ConsultationOverlay } from '../src/features/counseling/components/ConsultationOverlay';
import type { FlowState } from '../src/features/counseling/flow/engine';

const base: FlowState = {
  phaseId: 'P02',
  screen: 'dialogue',
  speaker: '상담사',
  line: '어서 오세요.',
  choices: [],
  canTap: true,
  inputEnabled: false,
  notice: null,
  report: null,
  transcript: [],
  suggestion: '',
  topic: '',
  finished: false,
    pending: false,
};

const noop = () => {};

function textOf(state: FlowState): string[] {
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
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in (node as any))
      walk((node as any).children);
  };
  walk(tree.toJSON());
  ReactTestRenderer.act(() => tree.unmount());
  return out;
}

test('a dialogue beat shows the speaker, the line and the continue hint', () => {
  const text = textOf(base);
  expect(text).toContain('어서 오세요.');
  expect(text).toContain('상담사');
  expect(text.join(' ')).toMatch(/탭하여 계속|Tap to continue/);
});

test('choices are rendered one per option', () => {
  const text = textOf({
    ...base,
    screen: 'choices',
    canTap: false,
    choices: [
      { label: '재물운', choice: { locKey: 'a', english: '', goTo: '', branchTag: 'topic:wealth' } },
      { label: '연애운', choice: { locKey: 'b', english: '', goTo: '', branchTag: 'topic:love' } },
    ],
  });
  expect(text).toContain('재물운');
  expect(text).toContain('연애운');
});

test('the notice offers retry and leave rather than a dead screen', () => {
  const text = textOf({
    ...base,
    screen: 'notice',
    line: '',
    canTap: false,
    notice: { body: '연결이 끊겼습니다.', retryLabel: '다시', leaveLabel: '나가기' },
  });
  expect(text).toContain('연결이 끊겼습니다.');
  expect(text).toContain('다시');
  expect(text).toContain('나가기');
});

test('the report card draws a row per score', () => {
  const text = textOf({
    ...base,
    screen: 'report',
    line: '',
    canTap: false,
    report: {
      rows: [
        { label: '재물', score: 72 },
        { label: '연애', score: 40 },
      ],
      keywords: '변화, 기회',
      period: '9월~11월',
    },
  });
  expect(text).toContain('재물');
  expect(text).toContain('72');
  expect(text).toContain('변화, 기회');
});

test('the loop shows the transcript and the follow-up pill', () => {
  const text = textOf({
    ...base,
    screen: 'loop',
    line: '',
    canTap: false,
    inputEnabled: true,
    suggestion: '다음은 무엇이 궁금하신가요?',
    transcript: [
      { role: 'user', text: '올해 재물운은?' },
      { role: 'counselor', text: '흐름이 좋습니다.' },
    ],
  });
  expect(text).toContain('올해 재물운은?');
  expect(text).toContain('흐름이 좋습니다.');
  expect(text).toContain('다음은 무엇이 궁금하신가요?');
});

test('an immersion beat with nothing to say draws nothing at all', () => {
  expect(textOf({ ...base, screen: 'none', line: '', canTap: false })).toEqual([]);
});
