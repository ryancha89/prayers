import { devlog } from '../../../shared/devlog';
import { useDiaryStore, type DiaryPhoto } from './diaryStore';

/**
 * Photos on a diary entry (spec 006 US4): picked from the library, copied into the app's own
 * Documents folder (the picker's file is a temp file iOS purges — plan R11), and uploaded by the
 * diary's queue (`flushPhotos`).
 *
 * BOTH NATIVE MODULES ARE GUARDED REQUIRES (memory `prayers-release-gaps`): a build without the
 * pods still runs, and Add Photo says plainly that it is not available rather than failing on tap.
 * Metro treats a require inside try/catch as optional, so a missing package does not break the
 * bundle either.
 *   - `react-native-image-picker` — the library picker (PHPicker on iOS 14+).
 *   - `@dr.pogodin/react-native-fs` — the copy into Documents. Without it the picker's own file is
 *     kept, which survives until iOS clears tmp; the upload usually beats that.
 *
 * THE PICKER'S FILE IS NEVER SHOWN (07-10, blank tiles on the iOS 26 simulator). On iOS the library
 * decodes each pick, re-encodes it and writes it to tmp — but it ignores both a failed
 * `loadFileRepresentation` and a failed write, and returns the uri of the file it meant to write
 * (ImagePickerManager.mm `mapImageToAsset`: `[data writeToFile:path atomically:YES]` unchecked, then
 * `asset[@"uri"] = …`). A uri is no proof of a file. So every pick is copied at once into
 * Documents/diary/_pending/<photoId>.jpg and checked; the preview shows the copy, Save moves it into
 * the entry's folder, a discarded sheet deletes it, and a pick that left no file is dropped and said.
 */
export const MAX_PHOTOS = 4;
/** The server re-optimises to 1,600 px on the long edge; asking the picker for the same keeps the
 *  upload small. */
const MAX_EDGE = 1600;

interface PickerAsset { uri?: string; width?: number; height?: number; type?: string }
interface PickerModule {
  launchImageLibrary(options: object): Promise<{ didCancel?: boolean; errorCode?: string; errorMessage?: string; assets?: PickerAsset[] }>;
}
interface FsModule {
  DocumentDirectoryPath: string;
  mkdir(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  /** Optional in the type: older builds of the module and the jest mock may not have them. */
  moveFile?(from: string, to: string): Promise<void>;
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

/** Whether Add Photo can work in this build. */
export const photosAvailable = (): boolean => picker() != null;

export interface PickedPhoto { id: string; uri: string; width: number; height: number }

export type PickResult =
  /** `failed`: picks the library answered for that left no readable file (dropped from `photos`). */
  | { status: 'ok'; photos: PickedPhoto[]; failed: number }
  | { status: 'cancel' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error' };

let seq = 0;
export const photoId = () => `ph_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Up to `room` images from the library (never more than MAX_PHOTOS). */
export async function pickPhotos(room: number): Promise<PickResult> {
  const p = picker();
  if (!p) return { status: 'unavailable' };
  const limit = Math.max(0, Math.min(MAX_PHOTOS, room));
  if (limit === 0) return { status: 'cancel' };
  try {
    const res = await p.launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: limit,
      maxWidth: MAX_EDGE,
      maxHeight: MAX_EDGE,
      quality: 0.85,
      includeBase64: false,
      // Never the location: the server strips EXIF too, but nothing needs it to leave the phone.
      includeExtra: false,
      // A JPEG rendition from Photos rather than whatever type the item lists first (HEIC, a live-photo
      // bundle): the library loads that first-listed type and drops the pick silently if it fails.
      assetRepresentationMode: 'compatible',
    });
    if (res.didCancel) return { status: 'cancel' };
    if (res.errorCode === 'permission') return { status: 'denied' };
    if (res.errorCode) {
      devlog(`[diary] picker ${res.errorCode} ${res.errorMessage ?? ''}`);
      return { status: 'error' };
    }
    const assets = (res.assets ?? []).slice(0, limit);
    if (assets.length === 0) return { status: 'cancel' };
    const photos: PickedPhoto[] = [];
    for (const a of assets) {
      const id = photoId();
      const uri = typeof a.uri === 'string' && a.uri.length > 0 ? a.uri : null;
      const kept = uri ? await stagePicked(id, uri, a) : null;
      if (kept) photos.push({ id, uri: kept, width: a.width ?? 0, height: a.height ?? 0 });
    }
    const failed = assets.length - photos.length;
    return photos.length > 0 ? { status: 'ok', photos, failed } : { status: 'error' };
  } catch (e) {
    devlog(`[diary] picker threw ${String(e)}`);
    return { status: 'error' };
  }
}

const dirFor = (f: FsModule, memoryId: string) => `${f.DocumentDirectoryPath}/diary/${memoryId}`;
/** Where a pick waits between the picker and Save. Not a memory id: those are never underscored. */
const pendingDir = (f: FsModule) => `${f.DocumentDirectoryPath}/diary/_pending`;
/** A file:// uri → a path. The library's uri is an NSURL `absoluteString`, so it is percent-encoded. */
const stripScheme = (uri: string) => {
  const path = uri.replace(/^file:\/\//, '');
  try { return decodeURI(path); } catch { return path; }
};
const isPending = (f: FsModule, uri: string) => stripScheme(uri).startsWith(`${pendingDir(f)}/`);

/** A file's size in bytes; null when it is not there. Without `stat`, an existing file reports -1. */
async function sizeOf(f: FsModule, path: string): Promise<number | null> {
  if (typeof f.stat === 'function') {
    try { return Number((await f.stat(path)).size); } catch { return null; }
  }
  return (await f.exists(path)) ? -1 : null;
}

/**
 * Copy one pick into Documents/diary/_pending/<id>.jpg and prove the copy is there. Returns the
 * copy's file:// uri; the picker's own uri when this build has no fs module (the old behaviour);
 * null when there is nothing readable to show — the library's file was never written, or is empty.
 */
async function stagePicked(id: string, uri: string, a: PickerAsset): Promise<string | null> {
  const f = fs();
  if (!f) {
    devlog(`[diary] picked ${id} ${uri} -> (no fs module, kept as is) ${a.width ?? 0}x${a.height ?? 0}`);
    return uri;
  }
  const from = stripScheme(uri);
  const to = `${pendingDir(f)}/${id}.jpg`;
  try {
    const source = await sizeOf(f, from);
    if (source == null || source === 0) {
      devlog(`[diary] picked ${id} ${uri} -> source ${source == null ? 'missing' : 'empty'} ${a.width ?? 0}x${a.height ?? 0} ${a.type ?? ''}`);
      return null;
    }
    await f.mkdir(pendingDir(f));
    await f.copyFile(from, to);
    const bytes = await sizeOf(f, to);
    devlog(`[diary] picked ${id} ${uri} -> ${to} ${bytes ?? 'missing'} ${a.width ?? 0}x${a.height ?? 0}`);
    if (bytes == null || bytes === 0) {
      await f.unlink(to).catch(() => {});
      return null;
    }
    return `file://${to}`;
  } catch (e) {
    devlog(`[diary] picked ${id} ${uri} -> copy failed ${String(e)}`);
    return null;
  }
}

/** The sheet was closed without saving: its pending copies go. Never throws, never touches a file
 *  outside the pending folder (an edited entry's own photos are not the sheet's to delete). */
export async function discardPending(photos: PickedPhoto[]): Promise<void> {
  const f = fs();
  if (!f) return;
  for (const p of photos) if (isPending(f, p.uri)) await removeLocal(p.uri);
}

/** Leftovers from a sheet the app died under: empty the pending folder. Called when a Write sheet
 *  opens, when no other sheet can own a pending file. */
export async function sweepPending(): Promise<void> {
  const f = fs();
  if (!f) return;
  try {
    if (await f.exists(pendingDir(f))) await f.unlink(pendingDir(f));
  } catch {}
}

/** Put a picked file at Documents/diary/<memoryId>/<photoId>.jpg — moved out of the pending folder,
 *  or copied from anywhere else. Returns the file:// uri to keep: the one it had when there is no fs
 *  module or the move failed (a pending copy is still inside Documents, so it is still kept). */
export async function keepLocal(memoryId: string, photo: PickedPhoto): Promise<string> {
  const f = fs();
  if (!f) return photo.uri;
  try {
    const dir = dirFor(f, memoryId);
    await f.mkdir(dir);
    const to = `${dir}/${photo.id}.jpg`;
    const from = stripScheme(photo.uri);
    if (!isPending(f, photo.uri)) await f.copyFile(from, to);
    else if (typeof f.moveFile === 'function') await f.moveFile(from, to);
    else { await f.copyFile(from, to); await f.unlink(from).catch(() => {}); }
    return `file://${to}`;
  } catch (e) {
    devlog(`[diary] keepLocal failed ${String(e)}`);
    return photo.uri;
  }
}

/** Remove the phone's copy of one photo; never throws. */
export async function removeLocal(uri: string | undefined): Promise<void> {
  const f = fs();
  if (!f || !uri) return;
  const path = stripScheme(currentLocalUri(uri)!);
  if (!path.startsWith(`${f.DocumentDirectoryPath}/`)) return; // never delete outside our own folder
  try {
    if (await f.exists(path)) await f.unlink(path);
  } catch {}
}

/** A new photo's slot: after the last one while that fits the server's 0…MAX-1 range, else the
 *  first free slot — the server clamps a position past the end, which would collide. */
export function nextPosition(list: { position: number }[]): number {
  const after = list.reduce((n, p) => Math.max(n, p.position + 1), 0);
  if (after < MAX_PHOTOS) return after;
  const used = new Set(list.map(p => p.position));
  for (let i = 0; i < MAX_PHOTOS; i += 1) if (!used.has(i)) return i;
  return MAX_PHOTOS - 1;
}

/**
 * A kept copy's uri for this launch. The absolute path persisted at Save carries the app
 * container's UUID, which iOS can change on an update or a restore; the part under Documents/
 * stays the same, so it is re-rooted on the current Documents folder.
 */
export function currentLocalUri(uri: string | undefined): string | undefined {
  const f = fs();
  if (!f || !uri) return uri;
  const path = stripScheme(uri);
  if (path.startsWith(`${f.DocumentDirectoryPath}/`)) return uri;
  const at = path.indexOf('/Documents/diary/');
  if (at < 0) return uri;
  return `file://${f.DocumentDirectoryPath}${path.slice(at + '/Documents'.length)}`;
}

/** Attach picked photos to a saved entry: copy each into Documents, then queue it for upload. */
export async function attachPhotos(memoryId: string, picked: PickedPhoto[]): Promise<void> {
  const already = useDiaryStore.getState().photos[memoryId] ?? [];
  const kept: DiaryPhoto[] = [];
  for (let i = 0; i < picked.length && already.length + kept.length < MAX_PHOTOS; i += 1) {
    const p = picked[i];
    kept.push({
      id: p.id, localUri: await keepLocal(memoryId, p), width: p.width, height: p.height,
      position: nextPosition([...already, ...kept]), uploaded: false,
    });
  }
  if (kept.length > 0) useDiaryStore.getState().addPhotos(memoryId, kept);
}

/** Take a photo off an entry: the phone's copy now, the server's on the next flush. */
export async function detachPhoto(memoryId: string, id: string): Promise<void> {
  const photo = (useDiaryStore.getState().photos[memoryId] ?? []).find(p => p.id === id);
  useDiaryStore.getState().removePhoto(memoryId, id);
  await removeLocal(photo?.localUri);
}

/** The entry is deleted: every local copy goes (the server's go with the row's delete). */
export async function dropLocalPhotos(memoryId: string): Promise<void> {
  const list = useDiaryStore.getState().photos[memoryId] ?? [];
  useDiaryStore.getState().dropMemory(memoryId);
  for (const p of list) await removeLocal(p.localUri);
}

/** Sign-out / account deletion: every kept copy on the phone, all entries at once. */
export async function forgetAllLocalPhotos(): Promise<void> {
  const f = fs();
  if (!f) return;
  try {
    const dir = `${f.DocumentDirectoryPath}/diary`;
    if (await f.exists(dir)) await f.unlink(dir);
  } catch {}
}

/** Entries that left the 아카이브 some other way (deleted on another device, or from the 아카이브
 *  tab): their reflection, photo rows and kept copies go too. */
export async function pruneDiary(liveIds: Set<string>): Promise<void> {
  const { photos, reflections } = useDiaryStore.getState();
  // Never a photo the server has not got: a pull that raced a Save can miss the new row for one
  // round, and its un-uploaded picks are the only copies there are.
  const holdsLocalOnly = (id: string) => (photos[id] ?? []).some(p => !p.uploaded);
  const gone = new Set(
    [...Object.keys(photos), ...Object.keys(reflections)].filter(id => !liveIds.has(id) && !holdsLocalOnly(id)),
  );
  for (const id of gone) await dropLocalPhotos(id);
}
