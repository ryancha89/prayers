/**
 * The character screen with Unity (26-10): a live 3D pane — CHARACTER_INIT on the way in, SET on a
 * card tap, TRACKING from the camera switch, END on the way out — and the tracking state's line.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ name: 'CharacterSetup' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

type Listener = (e: { type: string; payload?: { state: string } }) => void;
const mockListeners: Listener[] = [];
const mockBridge = {
  onEvent: jest.fn((l: Listener) => { mockListeners.push(l); return () => {}; }),
  openCharacterPreview: jest.fn(),
  setCharacterPreview: jest.fn(),
  setFaceTracking: jest.fn(),
  setCharacterView: jest.fn(),
  confirmCharacter: jest.fn(),
  closeCharacterPreview: jest.fn(),
};
jest.mock('../src/features/counseling/bridge', () => ({
  isNativeUnity: () => true,
  // A getter: jest.mock is hoisted above `const mockBridge`, so read it when used, not at mock time.
  get nativeUnityBridge() { return mockBridge; },
}));

import { CharacterSelectScreen } from '../src/features/character/screens/CharacterSelectScreen';
import { OUTFIT_COVER } from '../src/features/character/screens/OutfitPanel';
import { OUTFIT_COLORS } from '../src/features/character/outfitCatalog';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { Text } from '../src/shared/components/Text';

let tree: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string) => tree.root.find(n => n.props.testID === id && !!n.props.onPress);
const texts = () => tree.root.findAllByType(Text).map(n => [].concat(n.props.children).join(''));

beforeEach(async () => {
  Object.values(mockBridge).forEach(f => f.mockClear());
  mockListeners.length = 0;
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', gender: 'female', isUser: true },
    playerCharacter: undefined,
    playerHair: '',
    playerOutfit: '',
    creatorSeen: false,
  });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
});

it('opens the preview on the profile’s default, and swaps it on a card tap', async () => {
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(
    expect.objectContaining({ playerGender: 'female', playerCharacter: 'xb_f01' }));
  // One woman since 26-10 (the hanbok one is Yuna's remake): a profile with no gender sees both cards.
  act(() => tree.unmount());
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true } });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  await act(async () => byId('character-xb_m01').props.onPress());
  expect(mockBridge.setCharacterPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ playerCharacter: 'xb_m01' }));
});

it('the camera is coming soon: shown, disabled, and it never asks Unity for tracking', async () => {
  const cam = tree.root.find(n => n.props.testID === 'character-camera' && 'disabled' in n.props);
  expect(cam.props.disabled).toBe(true);
  // 04-11: the pill reads "📷 Coming soon" (the long label overflowed an SE); the full name stays in a11y
  expect(texts()).toContain('📷 Coming soon');
  expect(mockBridge.setFaceTracking).not.toHaveBeenCalled();
});

it('closes the preview on the way out', async () => {
  act(() => tree.unmount());
  expect(mockBridge.closeCharacterPreview).toHaveBeenCalledTimes(1);
});

it('one character for her gender: no step to "choose" it — hair (face shot) → outfit (whole body) → done, then the turn, then the store', async () => {
  jest.useFakeTimers();
  try {
    expect(tree.root.findAll(n => n.props.testID === 'character-step-look')).toHaveLength(0);
    // the first step is the hair, framed on the face
    expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0.8, focus: 'body' });
    const next = () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress);
    await act(async () => byId('character-hair-C46A86').props.onPress());
    expect(mockBridge.setCharacterPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ playerCharacter: 'xb_f01', playerHair: '#C46A86' }));
    await act(async () => next().props.onPress());
    // the outfit: framed on the whole body (the Sets tab), previewed live like the hair
    expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0, focus: 'body' });
    await act(async () => byId('character-outfit-tab-colour').props.onPress());
    await act(async () => byId('character-outfit-top-2E3A5C').props.onPress());
    await act(async () => byId('character-outfit-bottom-2E3A5C').props.onPress());
    expect(mockBridge.setCharacterPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ playerCharacter: 'xb_f01', playerHair: '#C46A86', playerOutfit: 't=orig:#2E3A5C;b=orig:#2E3A5C' }));
    await act(async () => next().props.onPress());
    expect(texts()).toContain('This is you in Prayers');
    expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0, focus: 'body' });
    // the last press: Unity's turn first, the store only after it
    const start = tree.root.find(n => n.props.label === 'Start' && !!n.props.onPress);
    await act(async () => start.props.onPress());
    expect(mockBridge.confirmCharacter).toHaveBeenCalledTimes(1);
    expect(useSubjectsStore.getState().playerCharacter).toBeUndefined();
    await act(async () => { jest.advanceTimersByTime(1300); });
    expect(useSubjectsStore.getState().playerCharacter).toBe('xb_f01');
    expect(useSubjectsStore.getState().playerHair).toBe('#C46A86');
    expect(useSubjectsStore.getState().playerOutfit).toBe('t=orig:#2E3A5C;b=orig:#2E3A5C');
    // an account that picked on the old card screen is shown the creator once; this ends that
    expect(useSubjectsStore.getState().creatorSeen).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('no gender yet: both characters, so the character step comes first', async () => {
  act(() => tree.unmount());
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true } });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(tree.root.findAll(n => n.props.testID === 'character-step-look').length).toBeGreaterThan(0);
  expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0, focus: 'body' });
});

it('the back arrow steps back before it leaves', async () => {
  await act(async () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress).props.onPress());
  expect(byId('character-back')).toBeTruthy();
  await act(async () => byId('character-back').props.onPress());
  expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 0.8 }));
});

it('the gesture hint is up until a finger turns the body — a step setting its shot is not a touch', async () => {
  // the hair step sent its face shot on mount; the hint must still be there
  expect(mockBridge.setCharacterView).toHaveBeenCalled();
  expect(texts()).toContain('Drag to turn · pinch to see the face');
});

it('no gender, no pick: the creator opens on the first card, never on a body that is not offered', async () => {
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true }, playerCharacter: undefined });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerCharacter: 'xb_f01' }));
});

it('opening the creator goes through the shared scene transition, as the creator', async () => {
  const { useSceneTransition } = require('../src/shared/transition/sceneTransition');
  expect(useSceneTransition.getState().active?.place).toBe('creator');
});

it('a card switch shows "preparing your character" until Unity has drawn the new body; a hair change does not', async () => {
  jest.useFakeTimers();
  try {
    act(() => tree.unmount());
    useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true }, playerCharacter: undefined });
    await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
    const loading = () => tree.root.findAll(n => n.props.testID === 'character-body-loading').length > 0;
    expect(loading()).toBe(false);                       // the first body rides the scene transition
    await act(async () => byId('character-xb_m01').props.onPress());
    expect(loading()).toBe(true);
    expect(texts()).toContain('Preparing your character…');
    await act(async () => mockListeners.forEach(l => l({ type: 'CHARACTER_BODY', payload: { id: 'xb_m01' } } as never)));
    act(() => { jest.advanceTimersByTime(400); });
    expect(loading()).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

const OUTFIT_COLORS_IDS = OUTFIT_COLORS.map(c => (c.hex ? c.hex.slice(1) : 'original'));
const toOutfit = async () => act(async () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress).props.onPress());
const tab = async (k: 'sets' | 'clothes' | 'colour') => act(async () => byId(`character-outfit-tab-${k}`).props.onPress());
const lastView = () => mockBridge.setCharacterView.mock.calls[mockBridge.setCharacterView.mock.calls.length - 1][0];
const lastOutfit = () => mockBridge.setCharacterPreview.mock.calls[mockBridge.setCharacterPreview.mock.calls.length - 1][0].playerOutfit;
const selected = (id: string) => byId(id).props.accessibilityState.selected;

it('the outfit step (04-11): hair → outfit → done in the step bar; three tabs, the sets first, the artist\'s own look worn', async () => {
  const steps = tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('character-step-') && !!n.props.onPress)
    .map(n => n.props.testID);
  expect(steps).toEqual(['character-step-hair', 'character-step-outfit', 'character-step-done']);
  await toOutfit();
  expect(texts()).toEqual(expect.arrayContaining(['Sets', 'Clothes', 'Colour', 'Reset']));
  // the outfit panel's own header: no name / face pill on this step, a dice and a Reset instead
  expect(tree.root.findAll(n => n.props.testID === 'character-shot')).toHaveLength(0);
  expect(byId('character-outfit-dice')).toBeTruthy();
  // her seven sets, "Original" worn (both slots on the artist's pieces), no "Custom" card
  expect(['original', 'school', 'winter', 'spring', 'casual', 'campus', 'weekend'].map(id => byId(`character-outfit-set-${id}`).props.accessibilityLabel))
    .toEqual(['Original', 'School', 'Winter knit', 'Spring', 'Casual', 'Campus', 'Weekend']);
  expect(selected('character-outfit-set-original')).toBe(true);
  expect(tree.root.findAll(n => n.props.testID === 'character-outfit-set-custom')).toHaveLength(0);
  // the clothes: a Top row and a Bottom row, her own piece first in each, by its name
  await tab('clothes');
  expect(texts()).toEqual(expect.arrayContaining(['Shirts', 'Pants & Skirts']));
  expect(['top-orig', 'top-hoodie', 'top-knit', 'top-shirt', 'bottom-orig', 'bottom-jeans', 'bottom-midi', 'bottom-chinos']
    .map(id => byId(`character-outfit-${id}`).props.accessibilityLabel))
    .toEqual(['Cardigan', 'Hoodie', 'Knit top', 'Overshirt', 'Skirt', 'Jeans', 'Midi skirt', 'Chinos']);
  expect(selected('character-outfit-top-orig')).toBe(true);
  expect(selected('character-outfit-bottom-orig')).toBe(true);
  // the colours: a chip row per slot, "Original" ringed on both
  await tab('colour');
  expect(selected('character-outfit-top-original')).toBe(true);
  expect(selected('character-outfit-bottom-original')).toBe(true);
  // backing out of the creator leaves the stored outfit as it was
  await act(async () => byId('character-outfit-top-7A2E3B').props.onPress());
  expect(lastOutfit()).toBe('t=orig:#7A2E3B');
  expect(useSubjectsStore.getState().playerOutfit).toBe('');
});

it('a set dresses both slots in one tap, previewed live; a change to one slot makes it "Custom"', async () => {
  await toOutfit();
  await act(async () => byId('character-outfit-set-school').props.onPress());
  expect(selected('character-outfit-set-school')).toBe(true);
  expect(selected('character-outfit-set-original')).toBe(false);
  expect(lastOutfit()).toBe('t=orig:school;b=orig:school');
  await act(async () => byId('character-outfit-set-campus').props.onPress());
  expect(lastOutfit()).toBe('t=knit;b=midi');
  // one slot off the set: no set is worn, the ringed "Custom" card leads the row and takes no tap
  await tab('clothes');
  await act(async () => byId('character-outfit-bottom-jeans').props.onPress());
  expect(lastOutfit()).toBe('t=knit;b=jeans');
  await tab('sets');
  const custom = tree.root.find(n => n.props.testID === 'character-outfit-set-custom');
  expect(custom.props.onPress).toBeUndefined();
  expect(custom.props.accessibilityLabel).toBe('Custom');
  expect(selected('character-outfit-set-campus')).toBe(false);
  // back onto a set: the card leaves
  await act(async () => byId('character-outfit-set-casual').props.onPress());
  expect(tree.root.findAll(n => n.props.testID === 'character-outfit-set-custom')).toHaveLength(0);
  expect(lastOutfit()).toBe('t=hoodie;b=jeans');
});

it('a top and a bottom are picked separately; a tint stays on the new item, a repaint drops', async () => {
  await toOutfit();
  await act(async () => byId('character-outfit-set-winter').props.onPress());       // orig:winter on both
  await tab('clothes');
  await act(async () => byId('character-outfit-top-knit').props.onPress());
  expect(lastOutfit()).toBe('t=knit;b=orig:winter');                                 // the repaint drops from the knit
  expect(selected('character-outfit-top-knit')).toBe(true);
  expect(selected('character-outfit-top-orig')).toBe(false);
  await tab('colour');
  await act(async () => byId('character-outfit-top-2E3A5C').props.onPress());
  expect(lastOutfit()).toBe('t=knit:#2E3A5C;b=orig:winter');
  expect(selected('character-outfit-top-2E3A5C')).toBe(true);
  // a repaint rings no chip, not even "Original"
  expect(selected('character-outfit-bottom-original')).toBe(false);
  expect(OUTFIT_COLORS_IDS.some(id => selected(`character-outfit-bottom-${id}`))).toBe(false);
  await tab('clothes');
  await act(async () => byId('character-outfit-top-hoodie').props.onPress());
  expect(lastOutfit()).toBe('t=hoodie:#2E3A5C;b=orig:winter');                     // the tint rides along
  // the artist's piece again keeps the tint too; "Original" on the colour tab clears it
  await act(async () => byId('character-outfit-top-orig').props.onPress());
  expect(lastOutfit()).toBe('t=orig:#2E3A5C;b=orig:winter');
  await tab('colour');
  await act(async () => byId('character-outfit-top-original').props.onPress());
  expect(lastOutfit()).toBe('b=orig:winter');
});

it('the camera follows the tab and the row last touched, and comes back to the body off the step', async () => {
  await toOutfit();
  expect(lastView()).toEqual({ yaw: 0, zoom: 0, focus: 'body' });
  await tab('clothes');
  expect(lastView()).toEqual({ yaw: 0, zoom: 0, focus: 'top' });
  await act(async () => byId('character-outfit-bottom-jeans').props.onPress());
  expect(lastView()).toEqual({ yaw: 0, zoom: 0, focus: 'bottom' });
  await tab('colour');
  expect(lastView().focus).toBe('bottom');                      // the row last touched, across tabs
  await act(async () => byId('character-outfit-top-8FA48A').props.onPress());
  expect(lastView().focus).toBe('top');
  await tab('sets');
  expect(lastView().focus).toBe('body');
  await tab('clothes');
  expect(lastView().focus).toBe('top');
  await act(async () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress).props.onPress());
  expect(lastView()).toEqual({ yaw: 0, zoom: 0, focus: 'body' });
});

it('the panel is short on the sets and tall on the clothes and colours', async () => {
  const { StyleSheet } = require('react-native');
  const panelH = () => {
    const panel = tree.root.findAll(n => typeof n.props.onLayout === 'function' && StyleSheet.flatten(n.props.style)?.minHeight > 0)
      .map(n => StyleSheet.flatten(n.props.style).minHeight as number);
    return Math.max(...panel);
  };
  const before = panelH();
  await toOutfit();
  const short = panelH();
  await tab('clothes');
  const tall = panelH();
  expect(short).toBeGreaterThan(before);
  expect(tall).toBeGreaterThan(short);
  expect(tall / short).toBeCloseTo(OUTFIT_COVER.clothes / OUTFIT_COVER.sets, 1);
  await tab('colour');
  expect(panelH()).toBe(tall);
});

it('the dice picks a set and some tints; Reset is the artist\'s own look again', async () => {
  await toOutfit();
  const seq = [0.5, 0.1, 0.5, 0.9];                               // set 3 (spring); the top tinted burgundy (tint 4), the bottom as the set
  const rand = jest.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0);
  try {
    await act(async () => byId('character-outfit-dice').props.onPress());
  } finally {
    rand.mockRestore();
  }
  expect(lastOutfit()).toBe('t=orig:#7A2E3B;b=orig:spring');
  expect(tree.root.find(n => n.props.testID === 'character-outfit-set-custom')).toBeTruthy();
  await act(async () => byId('character-outfit-reset').props.onPress());
  expect(lastOutfit()).toBe('');
  expect(selected('character-outfit-set-original')).toBe(true);
});

it('a stored set opens worn on its body, and another body\'s set falls back to the artist\'s own', async () => {
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ playerOutfit: 'set:winter' });    // the 02-11 form
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerOutfit: 't=orig:winter;b=orig:winter' }));
  await toOutfit();
  expect(selected('character-outfit-set-winter')).toBe(true);
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ playerOutfit: 't=orig:denim;b=orig:denim' });    // a men's set on her body
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerOutfit: '' }));
});

it('opens on the stored outfit, and a colour the palette dropped falls back to the artist\'s own', async () => {
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ playerOutfit: '#8FA48A' });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerOutfit: 't=orig:#8FA48A;b=orig:#8FA48A' }));
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ playerOutfit: '#123456' });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerOutfit: '' }));
});


it('the header fits a 375-pt SE: the title truncates to one line and the camera pill is capped', () => {
  // Jest has no layout engine, so the rules that keep the row on screen are pinned instead
  // (29-10: back + "Choose your character" + "Turn camera on · Coming soon" ≈ 430 pt vs 343).
  const { StyleSheet } = require('react-native');
  const title = tree.root.find(n => n.props.testID === 'character-title' && n.type === Text);
  expect(title.props.numberOfLines).toBe(1);
  expect(StyleSheet.flatten(title.props.style).flexShrink).toBeGreaterThan(0);
  const cam = tree.root.find(n => n.props.testID === 'character-camera' && 'disabled' in n.props);
  const pill = StyleSheet.flatten(typeof cam.props.style === 'function' ? cam.props.style({ pressed: false }) : cam.props.style);
  expect(pill.flexShrink).toBeGreaterThan(0);
  expect(pill.maxWidth).toBe('34%');
  const label = cam.findAll(n => n.type === Text)[0];
  expect(label.props.numberOfLines).toBe(1);
  // The whole name is still read out, truncated or not.
  expect(cam.props.accessibilityLabel).toBe('Turn camera on · Coming soon');
});
