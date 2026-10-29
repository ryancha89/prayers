/**
 * The consultation room must not miss a UNITY_READY that came before it mounted (29-10).
 *
 * On re-entry with a living Unity view, UnityEntry opens the session, hears the READY itself and
 * only then navigates to the room. The room's hook used to start not-ready and listen for a READY
 * that had already come and gone, so the veil sat out the 30 s deadline and walked the player out.
 * It now asks the bridge (`readyRoom()`) after subscribing.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/useScreenAudio', () => ({
  useScreenAudio: () => ({ active: { current: true } }),
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { UnityToRNEvent } from '../src/features/counseling/types';

let mockEmit: (e: UnityToRNEvent) => void = () => {};
let mockReadyRoom: { walkIn?: boolean } | null = null;
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
    readyRoom: () => mockReadyRoom,
  }),
  isNativeUnity: () => true,
}));

jest.mock('../src/features/counseling/flow/engine', () => ({
  ConsultationEngine: class {
    begin = mockBegin;
    subscribe = () => () => {};
    getState = () => ({ mic: { offered: false } });
    dispose = () => {};
    setLang = () => {};
  },
}));

import { useConsultationEngine, type Consultation } from '../src/features/counseling/hooks/useConsultationEngine';
import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

beforeEach(() => {
  mockBegin.mockClear();
  mockReadyRoom = null;
});

function mountRoom(): { current: Consultation | null } {
  const seen: { current: Consultation | null } = { current: null };
  function Room() {
    seen.current = useConsultationEngine({});
    return null;
  }
  act(() => {
    ReactTestRenderer.create(<Room />);
  });
  return seen;
}

it('a READY that came before the room mounted: ready at once, and the reading begins', () => {
  mockReadyRoom = {};
  const room = mountRoom();
  expect(room.current?.ready).toBe(true);
  expect(mockBegin).toHaveBeenCalledTimes(1);
});

it('…a walk-in one keeps the reading for UNITY_SEATED', () => {
  mockReadyRoom = { walkIn: true };
  const room = mountRoom();
  expect(room.current?.ready).toBe(true);
  expect(room.current?.walking).toBe(true);
  expect(mockBegin).not.toHaveBeenCalled();
  act(() => mockEmit({ type: 'UNITY_SEATED' }));
  expect(mockBegin).toHaveBeenCalledTimes(1);
});

it('no READY yet: waits for it as before', () => {
  const room = mountRoom();
  expect(room.current?.ready).toBe(false);
  act(() => mockEmit({ type: 'UNITY_READY' }));
  expect(room.current?.ready).toBe(true);
  expect(mockBegin).toHaveBeenCalledTimes(1);
});

describe('NativeUnityBridge.readyRoom', () => {
  const session = { sessionId: 's', counselor: { id: 'c', characterId: 'x', roomId: 'r', name: 'n' } } as never;

  it('remembers the room’s READY (and its walkIn) until another scene opens', async () => {
    const bridge = new NativeUnityBridge();
    bridge.registerView({ postMessage: () => {} });
    await bridge.openCounselingRoom(session);
    expect(bridge.readyRoom()).toBeNull();
    bridge.receiveFromUnity(JSON.stringify({ type: 'UNITY_READY', payload: { walkIn: true } }));
    expect(bridge.readyRoom()).toEqual({ walkIn: true });
    // Re-entry opens the room again: the old READY is not this visit's.
    await bridge.openCounselingRoom(session);
    expect(bridge.readyRoom()).toBeNull();
    bridge.receiveFromUnity(JSON.stringify({ type: 'UNITY_READY' }));
    expect(bridge.readyRoom()).toEqual({});
    await bridge.closeCounselingRoom();
    expect(bridge.readyRoom()).toBeNull();
  });

  it('another scene’s READY never counts as the room’s', () => {
    const bridge = new NativeUnityBridge();
    bridge.registerView({ postMessage: () => {} });
    bridge.openWorld({ lang: 'en' } as never);
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    expect(bridge.readyRoom()).toBeNull();
  });
});
