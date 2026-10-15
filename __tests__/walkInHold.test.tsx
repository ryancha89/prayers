/**
 * A walk-in room must show the room WITHOUT starting the reading.
 *
 * UNITY_READY used to say two things at once — "there is a room on screen" and "there is someone
 * in the chair" — and in the seated rooms those are the same instant, so nothing ever separated
 * them. A walk-in room breaks that: the player spawns six metres from the counselor and crosses
 * the floor on foot. Begin on READY there and the counselor delivers P01 to an empty chair while
 * the player is still walking, and the first thing they hear is the middle of a sentence.
 *
 * So the engine now waits for BOTH: the veil lifts on READY, the reading starts on UNITY_SEATED.
 * The two tests below are the two halves of that, and the third is the one that matters for every
 * room that is NOT a walk-in — they send no `walkIn` at all and must keep starting on READY alone.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { UnityToRNEvent } from '../src/features/counseling/types';

let mockEmit: (e: UnityToRNEvent) => void = () => {};
const mockBegin = jest.fn();

jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({
    onEvent: (h: (e: UnityToRNEvent) => void) => {
      mockEmit = h;
      return () => {};
    },
    sendEvent: () => {},
    openCounselingRoom: async () => {},
    closeCounselingRoom: async () => {},
  }),
  isNativeUnity: () => true,
}));

jest.mock('../src/features/counseling/flow/engine', () => ({
  ConsultationEngine: class {
    begin = mockBegin;
    subscribe = () => () => {};
    // Only the fields the hook itself reads; the engine's real state is not under test.
    getState = () => ({ mic: { offered: false } });
    dispose = () => {};
    setLang = () => {};
  },
}));

import { useConsultationEngine } from '../src/features/counseling/hooks/useConsultationEngine';

beforeEach(() => mockBegin.mockClear());

/** The hook needs to live inside a mounted component; this project has no renderHook helper. */
function mountRoom() {
  function Room() {
    useConsultationEngine({});
    return null;
  }
  act(() => {
    ReactTestRenderer.create(<Room />);
  });
}

it('does not start the reading while the player is still walking', () => {
  mountRoom();

  act(() => mockEmit({ type: 'UNITY_READY', payload: { walkIn: true } }));

  // The room is up — the veil is gone and the player can see where they are going. Nobody is
  // reading anything to them yet.
  expect(mockBegin).not.toHaveBeenCalled();
});

it('starts the reading when the player sits down', () => {
  mountRoom();

  act(() => mockEmit({ type: 'UNITY_READY', payload: { walkIn: true } }));
  act(() => mockEmit({ type: 'UNITY_SEATED' }));

  expect(mockBegin).toHaveBeenCalledTimes(1);
});

it('still starts on READY alone in a seated room', () => {
  mountRoom();

  // No payload at all — which is also what an older Unity build sends. It must behave exactly as
  // it always has, or this change breaks all three shipped rooms to fix one.
  act(() => mockEmit({ type: 'UNITY_READY' }));

  expect(mockBegin).toHaveBeenCalledTimes(1);
});
