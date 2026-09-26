import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ArchiveCategory, ArchiveDiscovery, ArchiveMemory, MemorySource } from '../types';
import { CATEGORIES } from '../types';

/**
 * 아카이브 — the player's long-term memory, kept on the phone first.
 *
 * Local is the source of truth for the screen: an entry typed on the bus exists the moment it is
 * typed. The server copy (memoriesApi) is what the counsellors read — on every turn, from either
 * request path — so every change here is queued (`dirty` / `deleted`) and pushed by `syncArchive`,
 * and a reinstall pulls the account's rows back down. Nothing is ever written to the server that
 * the player did not write or approve here.
 *
 * `discoveries` are the counsellor's guesses waiting for a verdict. They live apart from
 * `memories` on purpose: approved they become a memory with `source: counselor_discovery`;
 * declined they vanish; neither is decided by the app.
 */
let seq = 0;
export const memoryId = () => `mem_${Date.now().toString(36)}_${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

export interface NewMemory {
  category: ArchiveCategory;
  content: string;
  details?: Record<string, string>;
  importance?: 1 | 2 | 3;
  source?: MemorySource;
  confidence?: number;
}

interface ArchiveState {
  memories: ArchiveMemory[];
  discoveries: ArchiveDiscovery[];
  /** Ids changed since the last successful push. */
  dirty: string[];
  /** Ids removed since the last successful push. */
  deleted: string[];
  /** Daily-question ids already answered (or skipped) — the rota never repeats one. */
  answeredQuestions: number[];
  lastSyncedAt?: string;

  add: (m: NewMemory) => ArchiveMemory;
  update: (id: string, patch: Partial<Pick<ArchiveMemory, 'content' | 'details' | 'importance' | 'aiEnabled'>>) => void;
  remove: (id: string) => void;
  setAiEnabled: (id: string, on: boolean) => void;
  byCategory: (category: ArchiveCategory) => ArchiveMemory[];

  addDiscoveries: (found: { category: string; content: string }[], sessionId?: string) => void;
  approveDiscovery: (id: string, edits?: { category?: ArchiveCategory; content?: string }) => void;
  dismissDiscovery: (id: string) => void;

  markAnswered: (questionId: number) => void;

  /** Called by memoriesApi after a successful push: the queue is clear up to these ids. */
  pushed: (ids: string[], deletedIds: string[]) => void;
  /** Called by memoriesApi after a pull: the server's rows, merged under local unsynced edits. */
  merge: (rows: ArchiveMemory[]) => void;

  /** How much of the person is drawn — a game meter, not a claim about the AI. */
  completion: () => number;
}

const isCategory = (v: string): v is ArchiveCategory => (CATEGORIES as string[]).includes(v);

/** What "complete" means: a few entries in most categories, weighted to the ones that change a
 *  reading. 100% is deliberately reachable — a meter nobody can fill is a nag, not a game. */
const COMPLETION_TARGET: Record<ArchiveCategory, number> = {
  profile: 4,
  interest: 4,
  relationship: 3,
  career: 2,
  possession: 2,
  diary: 5,
  story: 3,
  like: 3,
  dislike: 2,
  goal: 3,
  manual: 3,
};

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set, get) => ({
      memories: [],
      discoveries: [],
      dirty: [],
      deleted: [],
      answeredQuestions: [],
      lastSyncedAt: undefined,

      add: input => {
        const t = now();
        const m: ArchiveMemory = {
          id: memoryId(),
          category: input.category,
          content: input.content.trim(),
          details: input.details ?? {},
          importance: input.importance ?? 2,
          confidence: input.confidence ?? 1,
          source: input.source ?? 'manual',
          aiEnabled: true,
          createdAt: t,
          updatedAt: t,
        };
        set(s => ({ memories: [m, ...s.memories], dirty: [...new Set([...s.dirty, m.id])] }));
        return m;
      },

      update: (id, patch) =>
        set(s => ({
          memories: s.memories.map(m => (m.id === id ? { ...m, ...patch, updatedAt: now() } : m)),
          dirty: [...new Set([...s.dirty, id])],
        })),

      remove: id =>
        set(s => ({
          memories: s.memories.filter(m => m.id !== id),
          dirty: s.dirty.filter(d => d !== id),
          deleted: [...new Set([...s.deleted, id])],
        })),

      setAiEnabled: (id, on) => get().update(id, { aiEnabled: on }),

      byCategory: category => get().memories.filter(m => m.category === category),

      addDiscoveries: (found, sessionId) => {
        const fresh = found
          .map(f => ({ category: isCategory(f.category) ? f.category : ('diary' as ArchiveCategory), content: f.content.trim() }))
          .filter(f => f.content.length > 0)
          // The same sentence twice in a session is one discovery.
          .filter(f => !get().discoveries.some(d => d.content === f.content))
          .map(f => ({ id: memoryId(), ...f, sessionId, createdAt: now() }));
        if (fresh.length === 0) return;
        set(s => ({ discoveries: [...s.discoveries, ...fresh] }));
      },

      approveDiscovery: (id, edits) => {
        const d = get().discoveries.find(x => x.id === id);
        if (!d) return;
        get().add({
          category: edits?.category ?? d.category,
          content: edits?.content ?? d.content,
          source: 'counselor_discovery',
          // Approved by the player, but phrased by the model: a notch under what they typed.
          confidence: 0.9,
        });
        set(s => ({ discoveries: s.discoveries.filter(x => x.id !== id) }));
      },

      dismissDiscovery: id => set(s => ({ discoveries: s.discoveries.filter(x => x.id !== id) })),

      markAnswered: questionId =>
        set(s => ({ answeredQuestions: [...new Set([...s.answeredQuestions, questionId])] })),

      pushed: (ids, deletedIds) =>
        set(s => ({
          dirty: s.dirty.filter(d => !ids.includes(d)),
          deleted: s.deleted.filter(d => !deletedIds.includes(d)),
          lastSyncedAt: now(),
        })),

      merge: rows => {
        const { memories, dirty, deleted } = get();
        const local = new Map(memories.map(m => [m.id, m]));
        const merged = new Map<string, ArchiveMemory>();
        // Server rows first; a local row still waiting to push wins over its server copy, and a
        // row deleted locally but not yet pushed stays deleted.
        rows.forEach(r => {
          if (deleted.includes(r.id)) return;
          merged.set(r.id, dirty.includes(r.id) && local.has(r.id) ? local.get(r.id)! : r);
        });
        memories.forEach(m => {
          if (!merged.has(m.id) && dirty.includes(m.id)) merged.set(m.id, m);
        });
        set({ memories: [...merged.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
      },

      completion: () => {
        const counts: Record<string, number> = {};
        get().memories.forEach(m => {
          counts[m.category] = (counts[m.category] ?? 0) + 1;
        });
        let have = 0;
        let want = 0;
        (Object.keys(COMPLETION_TARGET) as ArchiveCategory[]).forEach(c => {
          want += COMPLETION_TARGET[c];
          have += Math.min(counts[c] ?? 0, COMPLETION_TARGET[c]);
        });
        return want === 0 ? 0 : Math.round((have / want) * 100);
      },
    }),
    {
      name: 'prayers.archive.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({
        memories: s.memories,
        discoveries: s.discoveries,
        dirty: s.dirty,
        deleted: s.deleted,
        answeredQuestions: s.answeredQuestions,
        lastSyncedAt: s.lastSyncedAt,
      }),
    },
  ),
);
