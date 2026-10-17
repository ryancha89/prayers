import { devlog } from '../../../shared/devlog';
import { getUserAuth } from '../../auth/store/authStore';
import { fetchAvatarUrl, linkAvatar, uploadAvatar } from './avatarApi';
import { EMPTY_AVATAR, useAvatarStore } from './avatarStore';

/**
 * Profile photo: picked from the library or taken with the camera, kept in Documents/profile/, shown
 * at once, then sent up to the account (`avatarApi`) — and retried from `syncAvatar` when that fails.
 *
 * Same native-module rules as the diary's photos (`myroom/diary/photos.ts`, read its header): both
 * modules are GUARDED requires, so a build without the pods says "not available" instead of crashing
 * on tap; and the picker's tmp file is copied and checked at once, because iOS returns the uri of a
 * file it may never have written, and purges tmp anyway.
 */

/** An avatar is drawn at 88pt; 512px covers @3x with room, and the server re-optimises anyway. */
const MAX_EDGE = 512;

interface PickerAsset { uri?: string }
type PickerAnswer = { didCancel?: boolean; errorCode?: string; errorMessage?: string; assets?: PickerAsset[] };
interface PickerModule {
  launchImageLibrary(options: object): Promise<PickerAnswer>;
  launchCamera?(options: object): Promise<PickerAnswer>;
}
interface FsModule {
  DocumentDirectoryPath: string;
  mkdir(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  stat?(path: string): Promise<{ size: number | string }>;
  unlink(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

function picker(): PickerModule | null {
  try {
    const mod = require('react-native-image-picker');
    return typeof mod?.launchImageLibrary === 'function' ? (mod as PickerModule) : null;
  } catch {
    return null;
  }
}

function fs(): FsModule | null {
  try {
    const mod = require('@dr.pogodin/react-native-fs');
    const m = mod?.default ?? mod;
    return typeof m?.copyFile === 'function' && typeof m?.DocumentDirectoryPath === 'string' ? (m as FsModule) : null;
  } catch {
    return null;
  }
}

/** Whether the photo can be changed at all in this build. */
export const avatarAvailable = (): boolean => picker() != null;
/** Whether "Take photo" is worth offering (the module has it; the device may still say no). */
export const cameraAvailable = (): boolean => typeof picker()?.launchCamera === 'function';

export type AvatarPickResult =
  | { status: 'ok' }
  | { status: 'cancel' }
  | { status: 'denied' }
  | { status: 'noCamera' }
  | { status: 'unavailable' }
  | { status: 'error' };

const profileDir = (f: FsModule) => `${f.DocumentDirectoryPath}/profile`;
/** A file:// uri → a path. The library's uri is percent-encoded. */
const stripScheme = (uri: string) => {
  const path = uri.replace(/^file:\/\//, '');
  try { return decodeURI(path); } catch { return path; }
};

async function sizeOf(f: FsModule, path: string): Promise<number | null> {
  if (typeof f.stat === 'function') {
    try { return Number((await f.stat(path)).size); } catch { return null; }
  }
  return (await f.exists(path)) ? -1 : null;
}

/**
 * Copy the pick to Documents/profile/avatar_<stamp>.jpg and prove it is there. A new name every
 * time, not one fixed file: <Image> caches by uri, and the same uri with new bytes would keep
 * showing the old face. Null when there is nothing readable to keep.
 */
async function keepPicked(uri: string): Promise<string | null> {
  const f = fs();
  if (!f) return uri; // no fs module: the picker's own file, which lives until iOS clears tmp
  const from = stripScheme(uri);
  const to = `${profileDir(f)}/avatar_${Date.now().toString(36)}.jpg`;
  try {
    const source = await sizeOf(f, from);
    if (source == null || source === 0) {
      devlog(`[avatar] picked ${uri} -> source ${source == null ? 'missing' : 'empty'}`);
      return null;
    }
    await f.mkdir(profileDir(f));
    await f.copyFile(from, to);
    const bytes = await sizeOf(f, to);
    if (bytes == null || bytes === 0) {
      await f.unlink(to).catch(() => {});
      return null;
    }
    return `file://${to}`;
  } catch (e) {
    devlog(`[avatar] copy failed ${String(e)}`);
    return null;
  }
}

/** Remove a kept copy; never throws, never touches a file outside Documents/profile/. */
async function removeKept(uri: string | null): Promise<void> {
  const f = fs();
  if (!f || !uri) return;
  const path = stripScheme(uri);
  if (!path.startsWith(`${profileDir(f)}/`)) return;
  try {
    if (await f.exists(path)) await f.unlink(path);
  } catch {}
}

/**
 * The kept copy's uri for this launch. iOS can change the app container's UUID on an update or a
 * restore; the part under Documents/ stays, so it is re-rooted on the current Documents folder.
 */
export function currentAvatarUri(uri: string | null): string | null {
  const f = fs();
  if (!f || !uri) return uri;
  const path = stripScheme(uri);
  if (path.startsWith(`${f.DocumentDirectoryPath}/`)) return uri;
  const at = path.indexOf('/Documents/profile/');
  if (at < 0) return uri;
  return `file://${f.DocumentDirectoryPath}${path.slice(at + '/Documents'.length)}`;
}

/** Pick (or take) a new photo, show it, and send it up. */
export async function changeAvatar(source: 'library' | 'camera'): Promise<AvatarPickResult> {
  const p = picker();
  if (!p) return { status: 'unavailable' };
  const options = {
    mediaType: 'photo',
    maxWidth: MAX_EDGE,
    maxHeight: MAX_EDGE,
    quality: 0.8,
    includeBase64: false,
    includeExtra: false,
  };
  try {
    let res: PickerAnswer;
    if (source === 'camera') {
      if (typeof p.launchCamera !== 'function') return { status: 'noCamera' };
      res = await p.launchCamera({ ...options, cameraType: 'front', saveToPhotos: false });
    } else {
      // A JPEG rendition rather than whatever the item lists first (HEIC, a live photo) — see photos.ts.
      res = await p.launchImageLibrary({ ...options, selectionLimit: 1, assetRepresentationMode: 'compatible' });
    }
    if (res.didCancel) return { status: 'cancel' };
    if (res.errorCode === 'permission') return { status: 'denied' };
    if (res.errorCode === 'camera_unavailable') return { status: 'noCamera' };
    if (res.errorCode) {
      devlog(`[avatar] picker ${res.errorCode} ${res.errorMessage ?? ''}`);
      return { status: 'error' };
    }
    const uri = res.assets?.[0]?.uri;
    if (typeof uri !== 'string' || uri.length === 0) return { status: 'cancel' };
    const kept = await keepPicked(uri);
    if (!kept) return { status: 'error' };

    const prev = useAvatarStore.getState().localUri;
    useAvatarStore.setState({ uid: getUserAuth(), localUri: kept, pending: 'upload' });
    if (prev !== kept) await removeKept(prev);
    void pushAvatar();
    return { status: 'ok' };
  } catch (e) {
    devlog(`[avatar] picker threw ${String(e)}`);
    return { status: 'error' };
  }
}

/** Take the photo off: the phone's copy now, the account's on the next push. */
export async function removeAvatar(): Promise<void> {
  const { localUri } = useAvatarStore.getState();
  useAvatarStore.setState({ uid: getUserAuth(), localUri: null, remoteUrl: null, pending: 'remove' });
  await removeKept(localUri);
  void pushAvatar();
}

let pushing: Promise<void> | null = null;

/** Do whatever server step is owed (`pending`). One at a time; a later pick re-runs it. */
export function pushAvatar(): Promise<void> {
  if (pushing) return pushing.then(() => pushAvatar());
  pushing = (async () => {
    // Loop: a step can leave another owed ('upload' → 'link'), and a new pick can land mid-flight.
    for (let i = 0; i < 3; i += 1) {
      const s = useAvatarStore.getState();
      if (!s.pending || s.uid !== getUserAuth()) return;
      if (s.pending === 'upload') {
        if (!s.localUri) { useAvatarStore.setState({ pending: null }); return; }
        const sent = s.localUri;
        const url = await uploadAvatar(currentAvatarUri(sent) ?? sent);
        if (!url) return;
        // A newer pick while this one was in the air: that one is owed now, not this link.
        if (useAvatarStore.getState().localUri !== sent) continue;
        useAvatarStore.setState({ remoteUrl: url, pending: 'link' });
      } else if (s.pending === 'link') {
        if (!(await linkAvatar(s.remoteUrl))) return;
        if (useAvatarStore.getState().pending === 'link') useAvatarStore.setState({ pending: null });
      } else if (s.pending === 'remove') {
        if (!(await linkAvatar(null))) return;
        if (useAvatarStore.getState().pending === 'remove') useAvatarStore.setState({ pending: null });
      }
    }
  })().finally(() => { pushing = null; });
  return pushing;
}

/**
 * Called when the profile page opens. Another account's photo goes; an owed step is retried; and a
 * phone with no photo of its own asks the account for one (set on another device, or before a
 * reinstall). A phone that has its own copy does not ask: that copy is the newest it knows of.
 */
export async function syncAvatar(): Promise<void> {
  const uid = getUserAuth();
  if (!uid) return;
  const s = useAvatarStore.getState();
  if (s.uid !== uid) {
    await removeKept(s.localUri);
    useAvatarStore.setState({ ...EMPTY_AVATAR, uid });
  }
  if (useAvatarStore.getState().pending) return pushAvatar();
  if (useAvatarStore.getState().localUri) return;
  const url = await fetchAvatarUrl();
  // Only if nothing changed while asking — a pick made meanwhile wins.
  const now = useAvatarStore.getState();
  if (url !== undefined && now.uid === uid && !now.pending && !now.localUri) useAvatarStore.setState({ remoteUrl: url });
}

/** Sign-out / account deletion: the store and every kept copy. */
export async function forgetAvatar(): Promise<void> {
  useAvatarStore.setState(EMPTY_AVATAR);
  const f = fs();
  if (!f) return;
  try {
    if (await f.exists(profileDir(f))) await f.unlink(profileDir(f));
  } catch {}
}
