import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CounselingSubject } from '../../counseling/types';
import { defaultCharacterFor } from '../../character/characters';

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

export type PlayerGender = 'male' | 'female';
/** A character id from features/character/characters.ts — chosen after the profile (CharacterSelectScreen). */
export type PlayerCharacter = string;

interface SubjectsState {
  self: CounselingSubject;
  /**
   * The player's own character, picked on the screen after ProfileSetup. Undefined until picked,
   * which is what puts that screen up — so an account from before 26-10 is asked once too.
   * Separate from `self.gender` on purpose: gender reads the chart, this only picks a body.
   */
  playerCharacter?: PlayerCharacter;
  setPlayerCharacter: (c: PlayerCharacter) => void;
  /**
   * The player chose "later" at first run.
   *
   * Persisted, and deliberately so: asking again on every launch is nagging, and the app has a
   * second gate that catches this properly — the counselor screen refuses a consultation with no
   * chart and routes to the form. Cleared the moment `self` gets birth data, so it can never
   * outlive what it was deferring.
   */
  profileDeferred: boolean;
  deferProfile: () => void;
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
      profileDeferred: false,
      deferProfile: () => set({ profileDeferred: true }),
      playerCharacter: undefined,
      setPlayerCharacter: c => set({ playerCharacter: c }),
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
            ? {
                self: { ...state.self, ...patch },
                profileDeferred: false,
                // The character follows the gender (26-10): CHANGING the gender moves an existing
                // pick to the new gender's default, so the two can never disagree. Only an existing
                // one — the FIRST gender (ProfileSetup's "Get started") must leave it unset, or the
                // character screen right after it is skipped (that bug shipped for an hour, 26-10).
                ...(patch.gender && state.playerCharacter && patch.gender !== state.self.gender
                  ? { playerCharacter: defaultCharacterFor(patch.gender).id }
                  : {}),
              }
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
      partialize: state => ({
        self: state.self,
        subjects: state.subjects,
        profileDeferred: state.profileDeferred,
        playerCharacter: state.playerCharacter,
      }),
    },
  ),
);

export { SELF_DEFAULT as SELF };
