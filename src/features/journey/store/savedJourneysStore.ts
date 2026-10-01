import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../../../shared/i18n';
import type { JourneyContent, JourneyPart, JourneySummary } from '../types';

/**
 * 저장된 여행(신년운세) — a finished journey, kept on the phone so it can be opened again.
 *
 * Modelled on saju_front's 나의 리포트: a purchased 신년운세 report is stored as a whole (the
 * model, not a summary line) and reopened by id from the saved list. Here the "report" is the
 * journey's content — every station's narration text and cards plus the summary — captured the
 * moment the train arrives, i.e. once the counsellor's voice has told the whole year. The
 * narration audio itself stays on the server (synthesised once, streamed by URL); replaying a
 * saved journey asks for those URLs again exactly as the first ride did.
 *
 * One row per journey × counsellor: riding again with the same guide refreshes the row rather than
 * adding a second one.
 *
 * Paid moments: the server is the record of what was paid for (each part's `unlocked`), and a
 * saved row's content keeps the parts as they were — the text of a locked part was never sent, so
 * nothing here can open one. An unlock made on a ride is patched into that guide's saved row so the
 * row replays it offline, and the moment ids are kept per journey (unlocks are per account +
 * journey, not per guide) as a cache of what this phone has seen unlocked.
 */
export interface SavedJourney {
  id: string;
  journeyId: string;
  counselorId: string;
  tone: string;
  lang: Lang;
  year: number;
  content: JourneyContent;
  /** ISO. When the journey was completed (first time). */
  savedAt: string;
  /** ISO. Last completion or reopen. */
  updatedAt: string;
}

export interface NewSavedJourney {
  journeyId: string;
  counselorId: string;
  tone: string;
  lang: Lang;
  year: number;
  content: JourneyContent;
}

interface SavedJourneysState {
  journeys: SavedJourney[];
  /** Moment ids this phone has seen unlocked, by journey id. A cache: the server decides. */
  unlocks: Record<string, string[]>;
  /** Record a server-confirmed unlock, and patch the part into that guide's saved row if there is one. */
  addUnlock: (
    journeyId: string,
    counselorId: string,
    chapterId: string,
    part: JourneyPart,
    summary: JourneySummary | null,
  ) => void;
  unlocksOf: (journeyId: string) => string[];
  /** Stations whose free part has been heard, by journey id — the collection counts them. */
  heard: Record<string, string[]>;
  markHeard: (journeyId: string, chapterId: string) => void;
  /** Upsert by journey × counsellor. Returns the row. */
  save: (j: NewSavedJourney) => SavedJourney;
  remove: (id: string) => void;
  touch: (id: string) => void;
  /** Newest first. */
  list: () => SavedJourney[];
}

const now = () => new Date().toISOString();

/** `content` with one part replaced by its unlocked version (matched by moment id), the chapter's
 *  flattened narration redone, and the summary the unlock returned. */
export function withPart(
  content: JourneyContent,
  chapterId: string,
  part: JourneyPart,
  summary: JourneySummary | null,
): JourneyContent {
  return {
    ...content,
    summary: summary ?? content.summary,
    chapters: content.chapters.map(c => {
      if (c.id !== chapterId) return c;
      const parts = (c.parts ?? []).map(p => (p.momentId && p.momentId === part.momentId ? part : p));
      const narration = parts.filter(p => p.unlocked && p.text).map(p => p.text).join(' ');
      return { ...c, parts, narration };
    }),
  };
}
export const savedJourneyId = (journeyId: string, counselorId: string) => `${journeyId}::${counselorId}`;

export const useSavedJourneys = create<SavedJourneysState>()(
  persist(
    (set, get) => ({
      journeys: [],
      unlocks: {},
      addUnlock: (journeyId, counselorId, chapterId, part, summary) => {
        const id = savedJourneyId(journeyId, counselorId);
        const mid = part.momentId;
        set(s => {
          const prev = s.unlocks[journeyId] ?? [];
          return {
            unlocks: mid && !prev.includes(mid) ? { ...s.unlocks, [journeyId]: [...prev, mid] } : s.unlocks,
            journeys: s.journeys.map(j =>
              j.id !== id ? j : { ...j, content: withPart(j.content, chapterId, part, summary) },
            ),
          };
        });
      },
      unlocksOf: journeyId => get().unlocks[journeyId] ?? [],
      heard: {},
      markHeard: (journeyId, chapterId) => {
        const prev = get().heard[journeyId] ?? [];
        if (!prev.includes(chapterId)) set(s => ({ heard: { ...s.heard, [journeyId]: [...prev, chapterId] } }));
      },
      save: input => {
        const id = savedJourneyId(input.journeyId, input.counselorId);
        const prev = get().journeys.find(j => j.id === id);
        const row: SavedJourney = {
          id,
          journeyId: input.journeyId,
          counselorId: input.counselorId,
          tone: input.tone,
          lang: input.lang,
          year: input.year,
          content: input.content,
          savedAt: prev?.savedAt ?? now(),
          updatedAt: now(),
        };
        set(s => ({ journeys: [row, ...s.journeys.filter(j => j.id !== id)] }));
        return row;
      },
      remove: id => set(s => ({ journeys: s.journeys.filter(j => j.id !== id) })),
      touch: id =>
        set(s => ({ journeys: s.journeys.map(j => (j.id === id ? { ...j, updatedAt: now() } : j)) })),
      list: () => [...get().journeys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }),
    {
      name: 'prayers.savedJourneys.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ journeys: s.journeys, unlocks: s.unlocks, heard: s.heard }),
    },
  ),
);
