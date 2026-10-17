/**
 * Profile photo on My Page, with both native modules mocked (guarded requires, like the diary's).
 *
 * Pinned: a pick is copied into Documents/profile/ and shown at once; it is uploaded and linked to
 * the account's Profile row; offline it stays owed and goes up on the next sync; Remove clears the
 * phone copy and the row; another account's photo is never shown; a phone with no photo of its own
 * pulls the account's; and My Page draws the photo (or the glyph) with the camera badge.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn() }));
jest.mock('../src/features/auth/api/headers', () => {
  const headers = { 'Content-Type': 'application/json', 'User-Auth': 'uid-1' };
  return {
    apiHeaders: async () => headers,
    authedFetch: (url: string, init: RequestInit = {}) => (global as any).fetch(url, { ...init, headers }),
  };
});

const mockPicker = { launchImageLibrary: jest.fn(), launchCamera: jest.fn() };
jest.mock('react-native-image-picker', () => mockPicker);
const mockFiles = new Set<string>();
const mockFs = {
  DocumentDirectoryPath: '/docs',
  mkdir: jest.fn(async () => {}),
  copyFile: jest.fn(async (_from: string, to: string) => { mockFiles.add(to); }),
  unlink: jest.fn(async (p: string) => {
    [...mockFiles].filter(f => f === p || f.startsWith(`${p}/`)).forEach(f => mockFiles.delete(f));
  }),
  exists: jest.fn(async (p: string) => [...mockFiles].some(f => f === p || f.startsWith(`${p}/`))),
};
jest.mock('@dr.pogodin/react-native-fs', () => mockFs);

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useAvatarStore, EMPTY_AVATAR } from '../src/features/profile/avatar/avatarStore';
import { changeAvatar, removeAvatar, syncAvatar, pushAvatar, forgetAvatar } from '../src/features/profile/avatar/avatar';
import { MyPageScreen } from '../src/features/profile/screens/MyPageScreen';
import { useLanguageStore } from '../src/shared/i18n';

let online = true;
let serverImagePath: string | null = null;
const calls: { url: string; method: string; body?: any }[] = [];
(global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
  const method = init.method ?? 'GET';
  calls.push({ url, method, body: init.body });
  if (!online) throw new Error('offline');
  if (url.endsWith('/prayers/profile/upload_profile_image')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, url: 'https://cdn.test/profiles/a.webp' }) };
  }
  if (url.endsWith('/prayers/profile/update_profile_image')) {
    serverImagePath = JSON.parse(String(init.body)).profile.image_path;
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (url.endsWith('/prayers/profile') && method === 'GET') {
    return { ok: true, status: 200, json: async () => ({ id: 1, image_path: serverImagePath }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
});

const pickFile = (path = '/tmp/pick.jpg') => {
  mockFiles.add(path);
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets: [{ uri: `file://${path}` }] });
};

beforeEach(() => {
  online = true;
  serverImagePath = null;
  calls.length = 0;
  mockFiles.clear();
  mockPicker.launchImageLibrary.mockReset();
  mockPicker.launchCamera.mockReset();
  useAuthStore.setState({ userAuth: 'uid-1', displayName: 'Developer' });
  useAvatarStore.setState(EMPTY_AVATAR);
  useLanguageStore.setState({ lang: 'ko' });
});

it('keeps a pick in Documents/profile, uploads it, and links it to the account', async () => {
  pickFile();
  expect(await changeAvatar('library')).toEqual({ status: 'ok' });
  expect(mockPicker.launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({
    mediaType: 'photo', selectionLimit: 1, maxWidth: 512, maxHeight: 512, quality: 0.8, includeExtra: false,
  }));
  const s = useAvatarStore.getState();
  expect(s.localUri).toMatch(/^file:\/\/\/docs\/profile\/avatar_.*\.jpg$/);
  expect(s.uid).toBe('uid-1');

  await pushAvatar();
  expect(calls.map(c => `${c.method} ${c.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
    'POST /prayers/profile/upload_profile_image',
    'PATCH /prayers/profile/update_profile_image',
  ]);
  expect(useAvatarStore.getState()).toMatchObject({ remoteUrl: 'https://cdn.test/profiles/a.webp', pending: null });
  expect(serverImagePath).toBe('https://cdn.test/profiles/a.webp');
});

it('reads a refused permission, a cancel, and a device with no camera', async () => {
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ errorCode: 'permission' });
  expect(await changeAvatar('library')).toEqual({ status: 'denied' });
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ didCancel: true });
  expect(await changeAvatar('library')).toEqual({ status: 'cancel' });
  mockPicker.launchCamera.mockResolvedValueOnce({ errorCode: 'camera_unavailable' });
  expect(await changeAvatar('camera')).toEqual({ status: 'noCamera' });
  expect(useAvatarStore.getState().localUri).toBeNull();
});

it('drops a pick whose file the library never wrote', async () => {
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets: [{ uri: 'file:///tmp/ghost.jpg' }] });
  expect(await changeAvatar('library')).toEqual({ status: 'error' });
  expect(useAvatarStore.getState().localUri).toBeNull();
});

it('offline: the photo shows and stays owed; the next sync sends it', async () => {
  online = false;
  pickFile();
  await changeAvatar('library');
  await pushAvatar();
  expect(useAvatarStore.getState().pending).toBe('upload');
  expect(useAvatarStore.getState().localUri).not.toBeNull();

  online = true;
  await syncAvatar();
  expect(useAvatarStore.getState().pending).toBeNull();
  expect(serverImagePath).toBe('https://cdn.test/profiles/a.webp');
});

it('a new pick replaces the old copy on the phone', async () => {
  pickFile('/tmp/one.jpg');
  await changeAvatar('library');
  const first = useAvatarStore.getState().localUri!;
  await new Promise(r => setTimeout(r, 2)); // a distinct file name
  pickFile('/tmp/two.jpg');
  await changeAvatar('library');
  await pushAvatar();
  expect(mockFiles.has(first.replace('file://', ''))).toBe(false);
  expect([...mockFiles].filter(f => f.startsWith('/docs/profile/'))).toHaveLength(1);
});

it('Remove clears the phone copy and the account row', async () => {
  pickFile();
  await changeAvatar('library');
  await pushAvatar();
  await removeAvatar();
  await pushAvatar();
  expect([...mockFiles].filter(f => f.startsWith('/docs/profile/'))).toEqual([]);
  expect(useAvatarStore.getState()).toMatchObject({ localUri: null, remoteUrl: null, pending: null });
  expect(serverImagePath).toBeNull();
});

it('never shows another account\'s photo, and pulls the account\'s own when the phone has none', async () => {
  useAvatarStore.setState({ uid: 'someone-else', localUri: 'file:///docs/profile/avatar_x.jpg', remoteUrl: null, pending: null });
  serverImagePath = 'https://cdn.test/profiles/mine.webp';
  await syncAvatar();
  expect(useAvatarStore.getState()).toMatchObject({ uid: 'uid-1', localUri: null, remoteUrl: 'https://cdn.test/profiles/mine.webp' });
});

it('sign-out forgets the photo and its files', async () => {
  pickFile();
  await changeAvatar('library');
  await pushAvatar();
  await forgetAvatar();
  expect(useAvatarStore.getState()).toEqual(EMPTY_AVATAR);
  expect([...mockFiles].filter(f => f.startsWith('/docs/profile/'))).toEqual([]);
});

describe('My Page', () => {
  const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { tree = ReactTestRenderer.create(<MyPageScreen />); });
    return tree;
  };

  it('draws the glyph with a tappable avatar before any photo', async () => {
    const tree = await render();
    const avatar = tree.root.findByProps({ testID: 'profile-avatar' });
    expect(avatar.props.accessibilityLabel).toBe('프로필 사진 변경');
    expect(tree.root.findAllByProps({ testID: 'profile-avatar-image' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('draws the kept photo in the circle', async () => {
    useAvatarStore.setState({ uid: 'uid-1', localUri: 'file:///docs/profile/avatar_a.jpg', remoteUrl: null, pending: null });
    const tree = await render();
    const img = tree.root.findAll(n => n.props.testID === 'profile-avatar-image' && n.props.source);
    expect(img[0].props.source).toEqual({ uri: 'file:///docs/profile/avatar_a.jpg' });
    act(() => tree.unmount());
  });
});
