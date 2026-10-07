import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { noteReflection } from '../inbox/inboxStore';

/**
 * What the server keeps about a diary entry that the entry itself does not hold (spec 006): the
 * counsellor's reflection and the photos. Both are SERVER-OWNED and read-only in the memory JSON —
 * the archive row's `details` are last-writer-wins on sync, so a reflection kept there would be
 * wiped by the next push from any device (plan R4). This store is the phone's copy, keyed by the
 * memory id, filled from `GET memories` and from the reflection/photo calls.
 *
 * Photos also carry what only the phone knows: the local copy's path (R11) and whether the upload
 * has happened yet. A photo is `local` until the server has it, and stays on the phone either way.
 */
export type ReflectionStatus = 'pending' | 'ready' | 'fallback';

export interface DiaryReflection {
  status: ReflectionStatus;
  text: string;
  topics: string[];
  counselor: string;
  lang: string;
  stale: boolean;
  generatedAt?: string;
}

export interface DiaryPhoto {
  /** The client photo id — also the server's `client_photo_id`. */
  id: string;
  /** file:// path of the copy in Documents/diary/<memoryId>/; absent for a photo another device took. */
  localUri?: string;
  /** The server's link: presigned on R2, a path under the API base on the dev disk store. */
  url?: string;
  width: number;
  height: number;
  position: number;
  uploaded: boolean;
  /** The server refused it for good (size, type, limit): kept on the phone, never retried. */
  refused?: boolean;
}

interface DiaryState {
  reflections: Record<string, DiaryReflection>;
  photos: Record<string, DiaryPhoto[]>;
  /** Server copies still to delete: {memoryId, photoId}. Retried on the next sync. */
  photoDeletes: { memoryId: string; photoId: string }[];

  setReflection: (memoryId: string, r: DiaryReflection | null) => void;
  /** A pull's `reflection` / `photos`, merged: server photos win on url/size, local copies are kept,
   *  and a local photo the server does not have yet stays queued. */
  mergeServer: (rows: { id: string; reflection: DiaryReflection | null; photos: ServerPhoto[] }[]) => void;
  addPhotos: (memoryId: string, photos: DiaryPhoto[]) => void;
  markUploaded: (memoryId: string, photo: ServerPhoto) => void;
  markRefused: (memoryId: string, photoId: string) => void;
  removePhoto: (memoryId: string, photoId: string) => void;
  photoDeleted: (memoryId: string, photoId: string) => void;
  /** The entry is gone: forget its reflection and photos (their server copies go with the row). */
  dropMemory: (memoryId: string) => void;
}

export interface ServerPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  position: number;
}

/** A reflection that was being written and now is: the mailbox's "your counsellor read it". Only
 *  that transition — a pull that finds an old reading again, or a fresh install's first pull, is not
 *  news. A `fallback` is the server's stand-in, not a reading, and says nothing either. */
const becameReady = (prev: DiaryReflection | undefined, next: DiaryReflection | null | undefined) =>
  prev?.status === 'pending' && next?.status === 'ready';

export const useDiaryStore = create<DiaryState>()(
  persist(
    (set, get) => ({
      reflections: {},
      photos: {},
      photoDeletes: [],

      setReflection: (memoryId, r) => {
        if (becameReady(get().reflections[memoryId], r)) noteReflection(memoryId, r!.counselor);
        set(s => {
          const next = { ...s.reflections };
          if (r) next[memoryId] = r;
          else delete next[memoryId];
          return { reflections: next };
        });
      },

      mergeServer: rows => {
        const before = get().reflections;
        rows.forEach(row => {
          if (becameReady(before[row.id], row.reflection)) noteReflection(row.id, row.reflection!.counselor);
        });
        set(s => {
          const reflections = { ...s.reflections };
          const photos = { ...s.photos };
          rows.forEach(row => {
            if (row.reflection) reflections[row.id] = row.reflection;
            else delete reflections[row.id];
            const local = s.photos[row.id] ?? [];
            const deleting = new Set(s.photoDeletes.filter(d => d.memoryId === row.id).map(d => d.photoId));
            const merged: DiaryPhoto[] = row.photos
              .filter(p => !deleting.has(p.id))
              .map(p => {
                const mine = local.find(l => l.id === p.id);
                return { ...p, localUri: mine?.localUri, uploaded: true };
              });
            local.forEach(l => {
              if (!l.uploaded && !merged.some(m => m.id === l.id)) merged.push(l);
            });
            if (merged.length > 0) photos[row.id] = merged.sort((a, b) => a.position - b.position);
            else delete photos[row.id];
          });
          return { reflections, photos };
        });
      },

      addPhotos: (memoryId, list) =>
        set(s => ({ photos: { ...s.photos, [memoryId]: [...(s.photos[memoryId] ?? []), ...list] } })),

      // A late answer for an entry deleted meanwhile changes nothing (no empty list resurrected).
      markUploaded: (memoryId, p) =>
        set(s => !s.photos[memoryId] ? s : ({
          photos: {
            ...s.photos,
            [memoryId]: (s.photos[memoryId] ?? []).map(x =>
              x.id === p.id ? { ...x, url: p.url, width: p.width || x.width, height: p.height || x.height, uploaded: true } : x,
            ),
          },
        })),

      markRefused: (memoryId, photoId) =>
        set(s => !s.photos[memoryId] ? s : ({
          photos: { ...s.photos, [memoryId]: (s.photos[memoryId] ?? []).map(x => (x.id === photoId ? { ...x, refused: true } : x)) },
        })),

      removePhoto: (memoryId, photoId) =>
        set(s => {
          const had = (s.photos[memoryId] ?? []).find(p => p.id === photoId);
          return {
            photos: { ...s.photos, [memoryId]: (s.photos[memoryId] ?? []).filter(p => p.id !== photoId) },
            // Only a photo the server has needs a server delete.
            photoDeletes: had?.uploaded ? [...s.photoDeletes, { memoryId, photoId }] : s.photoDeletes,
          };
        }),

      photoDeleted: (memoryId, photoId) =>
        set(s => ({ photoDeletes: s.photoDeletes.filter(d => !(d.memoryId === memoryId && d.photoId === photoId)) })),

      dropMemory: memoryId =>
        set(s => {
          const reflections = { ...s.reflections };
          const photos = { ...s.photos };
          delete reflections[memoryId];
          delete photos[memoryId];
          // The row's delete on sync removes its server photos too (server T010).
          return { reflections, photos, photoDeletes: s.photoDeletes.filter(d => d.memoryId !== memoryId) };
        }),
    }),
    {
      name: 'prayers.diary.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ reflections: s.reflections, photos: s.photos, photoDeletes: s.photoDeletes }),
    },
  ),
);

/** A server `reflection` object, or null for anything that is not one. Read, not reshaped. */
export function readReflection(r: any): DiaryReflection | null {
  if (!r || typeof r !== 'object') return null;
  if (r.status !== 'pending' && r.status !== 'ready' && r.status !== 'fallback') return null;
  return {
    status: r.status,
    text: typeof r.text === 'string' ? r.text : '',
    topics: Array.isArray(r.topics) ? r.topics.filter((x: unknown) => typeof x === 'string') : [],
    counselor: typeof r.counselor === 'string' ? r.counselor : '',
    lang: typeof r.lang === 'string' ? r.lang : '',
    stale: r.stale === true,
    generatedAt: typeof r.generatedAt === 'string' ? r.generatedAt : undefined,
  };
}

export function readPhotos(list: any): ServerPhoto[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(p => p && typeof p.id === 'string' && typeof p.url === 'string')
    .map(p => ({
      id: p.id,
      url: p.url,
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
      position: Number(p.position) || 0,
    }));
}
