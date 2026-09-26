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
  tone: '',
  emotion: 'neutral',
  transcript: [],
  suggestion: '',
  topic: '',
  finished: false,
    pending: false,
  speaking: false,
  mic: { state: 'idle', level: 0, error: '', offered: true },
};

const noop = () => {};

function textOf(state: FlowState, counselorName?: string): string[] {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ConsultationOverlay
        state={state}
        counselorName={counselorName}
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

test('the card is signed with the counselor name, not the generic label', () => {
  // The flow asset labels every line "상담사" / "Counselor"; the room knows who is actually there.
  const text = textOf(base, '유나');
  expect(text).toContain('유나');
  expect(text).not.toContain('상담사');
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

/**
 * The sentence under the input when the take produced nothing.
 *
 * "I could not make out the words" is the right thing to say about a mumble and the wrong thing to
 * say about a route that does not exist — the player reads the second as their own fault.
 */
test('a server that cannot transcribe says so, instead of blaming the player', () => {
  const unavailable = textOf({
    ...base,
    screen: 'loop',
    line: '',
    canTap: false,
    inputEnabled: true,
    mic: { state: 'idle', level: 0, error: 'unavailable', offered: false },
  }).join(' ');
  expect(unavailable).toContain('Asking out loud is not available right now');
  expect(unavailable).not.toContain('could not make out the words');

  const mumbled = textOf({
    ...base,
    screen: 'loop',
    line: '',
    canTap: false,
    inputEnabled: true,
    mic: { state: 'idle', level: 0, error: 'no_speech', offered: true },
  }).join(' ');
  expect(mumbled).toContain('I did not hear anything');
});

test('the loop offers the two SAVIS answer styles, and only when a server is there to read them', () => {
  const loop: FlowState = {
    ...base,
    screen: 'loop',
    line: '',
    canTap: false,
    inputEnabled: true,
  };
  const render = (props: Partial<React.ComponentProps<typeof ConsultationOverlay>>) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ConsultationOverlay
          state={loop}
          onTap={noop}
          onChoose={noop}
          onSubmit={noop}
          onRetry={noop}
          onLeave={noop}
          {...props}
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
    return out.join(' ');
  };

  const withServer = render({ chatMode: 'detail', onChatMode: noop });
  expect(withServer).toMatch(/티키타카|Quick chat/);
  expect(withServer).toMatch(/깊은 풀이|Deep reading/);

  // No handler, no segment: a mock room has no styles to choose between.
  const without = render({});
  expect(without).not.toMatch(/티키타카|Quick chat/);
});
