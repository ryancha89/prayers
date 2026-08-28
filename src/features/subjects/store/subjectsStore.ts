import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CounselingSubject } from '../../counseling/types';

/** Saved people the user can ask about (spec §14, §15). */

const SELF: CounselingSubject = {
  id: 'self',
  displayName: 'Myself',
  isUser: true,
};

interface SubjectsState {
  subjects: CounselingSubject[]; // saved people (excludes the implicit self)
  addSubject: (s: Omit<CounselingSubject, 'id' | 'isUser'>) => CounselingSubject;
  removeSubject: (id: string) => void;
  /** Self + saved people, self always first. */
  all: () => CounselingSubject[];
  getById: (id: string) => CounselingSubject | undefined;
}

let seq = 0;
const makeId = () => `subj_${Date.now().toString(36)}_${seq++}`;

export const useSubjectsStore = create<SubjectsState>()(
  persist(
    (set, get) => ({
      subjects: [
        { id: 'subj_minji', displayName: 'Minji Kim', birthDate: '1995-04-12', isUser: false },
        { id: 'subj_jiwon', displayName: 'Jiwon Lee', birthDate: '1993-11-04', isUser: false },
      ],
      addSubject: partial => {
        const subject: CounselingSubject = { ...partial, id: makeId(), isUser: false };
        set(state => ({ subjects: [...state.subjects, subject] }));
        return subject;
      },
      removeSubject: id => set(state => ({ subjects: state.subjects.filter(s => s.id !== id) })),
      all: () => [SELF, ...get().subjects],
      getById: id => (id === 'self' ? SELF : get().subjects.find(s => s.id === id)),
    }),
    {
      name: 'prayers.subjects.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ subjects: state.subjects }),
    },
  ),
);

export { SELF };
