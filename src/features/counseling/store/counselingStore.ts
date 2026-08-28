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

  begin: (counselor: CounselorSummary) => void;
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

  begin: counselor => set({ counselor, subject: undefined, topic: undefined }),
  setSubject: subject => set({ subject }),
  setTopic: topic => set({ topic }),
  reset: () => set({ counselor: undefined, subject: undefined, topic: undefined }),

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
