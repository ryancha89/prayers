import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../../../shared/i18n';
import type { JourneyContent } from '../types';

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
  /** Upsert by journey × counsellor. Returns the row. */
  save: (j: NewSavedJourney) => SavedJourney;
  remove: (id: string) => void;
  touch: (id: string) => void;
  /** Newest first. */
  list: () => SavedJourney[];
}

const now = () => new Date().toISOString();
export const savedJourneyId = (journeyId: string, counselorId: string) => `${journeyId}::${counselorId}`;

export const useSavedJourneys = create<SavedJourneysState>()(
  persist(
    (set, get) => ({
      journeys: [],
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
      partialize: s => ({ journeys: s.journeys }),
    },
  ),
);
