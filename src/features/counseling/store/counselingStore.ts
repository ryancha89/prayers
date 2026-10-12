import { create } from 'zustand';
import { CounselingSubject, CounselingTopic, UnitySessionPayload } from '../types';
import { CounselorSummary } from '../../counselors/types';

/**
 * Ephemeral setup state for the flow: Detail → Subject → Topic → Unity entry
 * (spec §14-17). Not persisted — the durable record lives in conversationsStore.
 */
interface CounselingState {
  counselor?: CounselorSummary;
  subject?: CounselingSubject;
  topic?: CounselingTopic;
  /**
   * A diary entry the next consultation opens on (spec 006 R9): sent as `focus_memory_id` with
   * EVERY server turn of that session, so the counsellor sees that entry even when retrieval would
   * not pick it. Not taken once: the first ask is often the staged reading, which the server keeps
   * memory-free, and a retried turn must carry it too. Cleared by the next `begin` / `reset`.
   */
  focusMemoryId?: string;

  begin: (counselor: CounselorSummary, opts?: { focusMemoryId?: string }) => void;
  currentFocus: () => string | undefined;
  /** The room closed: the entry goes with it, so a resumed or other session never carries it. */
  clearFocus: () => void;
  setSubject: (subject: CounselingSubject) => void;
  setTopic: (topic: CounselingTopic) => void;
  reset: () => void;

  /** Stable id so the same counselor+subject resumes one session (spec §31). */
  sessionId: () => string;
  buildPayload: (locale: string) => UnitySessionPayload | undefined;
}

export const useCounselingStore = create<CounselingState>((set, get) => ({
  counselor: undefined,
  subject: undefined,
  topic: undefined,

  // Every start sets the focus — to nothing, unless this start came from a diary entry — so an entry
  // never leaks into a consultation begun some other way.
  begin: (counselor, opts) => set({ counselor, subject: undefined, topic: undefined, focusMemoryId: opts?.focusMemoryId }),
  currentFocus: () => get().focusMemoryId,
  clearFocus: () => set({ focusMemoryId: undefined }),
  setSubject: subject => set({ subject }),
  setTopic: topic => set({ topic }),
  reset: () => set({ counselor: undefined, subject: undefined, topic: undefined, focusMemoryId: undefined }),

  sessionId: () => {
    const { counselor, subject } = get();
    if (!counselor || !subject) return '';
    return `session_${counselor.id}_${subject.id}`;
  },

  buildPayload: locale => {
    const { counselor, subject, topic } = get();
    if (!counselor || !subject) return undefined;
    return {
      sessionId: get().sessionId(),
      counselor: {
        id: counselor.id,
        characterId: counselor.characterId,
        roomId: counselor.roomId,
        name: counselor.name,
      },
      subject: {
        id: subject.id,
        displayName: subject.displayName,
        birthDate: subject.birthDate,
        birthTime: subject.birthTime,
      },
      topic,
      locale,
    };
  },
}));
