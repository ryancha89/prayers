import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CounselingSubject } from '../../counseling/types';

/** Saved people the user can ask about (spec §14, §15). */

/**
 * The account holder, before they have said who they are.
 *
 * This used to be the whole of "self": a frozen constant with a name nobody chose and no birth
 * date, which is why the consultation could never be about the person having it. It is the DEFAULT
 * now, not the value — `self` is stored and editable like anyone else.
 */
const SELF_DEFAULT: CounselingSubject = {
  id: 'self',
  displayName: 'Myself',
  isUser: true,
};

/** A subject the server can actually build a chart from. Name alone is not enough. */
export const hasBirthData = (s?: CounselingSubject): boolean =>
  !!s && !!s.birthDate && !!s.gender;

interface SubjectsState {
  self: CounselingSubject;
  subjects: CounselingSubject[]; // saved people (excludes self)
  addSubject: (s: Omit<CounselingSubject, 'id' | 'isUser'>) => CounselingSubject;
  updateSubject: (id: string, patch: Partial<Omit<CounselingSubject, 'id' | 'isUser'>>) => void;
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
      self: SELF_DEFAULT,
      subjects: [
        // Gender is part of the seed because it is part of a usable subject: without it these two
        // would sit in the picker looking complete and then send the player to a form.
        { id: 'subj_minji', displayName: 'Minji Kim', birthDate: '1995-04-12', gender: 'female', isUser: false },
        { id: 'subj_jiwon', displayName: 'Jiwon Lee', birthDate: '1993-11-04', gender: 'female', isUser: false },
      ],
      addSubject: partial => {
        const subject: CounselingSubject = { ...partial, id: makeId(), isUser: false };
        set(state => ({ subjects: [...state.subjects, subject] }));
        return subject;
      },
      updateSubject: (id, patch) =>
        set(state =>
          id === 'self'
            ? { self: { ...state.self, ...patch } }
            : {
                subjects: state.subjects.map(s => (s.id === id ? { ...s, ...patch } : s)),
              },
        ),
      removeSubject: id => set(state => ({ subjects: state.subjects.filter(s => s.id !== id) })),
      all: () => [get().self, ...get().subjects],
      getById: id => (id === 'self' ? get().self : get().subjects.find(s => s.id === id)),
    }),
    {
      name: 'prayers.subjects.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // `self` is persisted now: it carries the account holder's own birth data, which is the
      // whole point of making it editable.
      partialize: state => ({ self: state.self, subjects: state.subjects }),
    },
  ),
);

export { SELF_DEFAULT as SELF };
