import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CounselingSubject } from '../../counseling/types';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';

/**
 * Whose year the journey reads (10-12: "2027년 여정에 먼저 프로필 선택"). The player picks a profile
 * before the guide — themselves or anyone in their saved profiles — and every request of the ride
 * (content, unlock, report) carries that person's birth data. The server keeps one journey per person
 * (`Prayers::JourneyProfile`), so riding for a friend never overwrites the player's own.
 *
 * Remembered across launches: a ride resumed from the mini player, the result screen and the report
 * are all about the person who was chosen, not whoever the app would default to.
 */
interface JourneyProfileState {
  subjectId: string;
  setSubjectId: (id: string) => void;
}

export const useJourneyProfile = create<JourneyProfileState>()(
  persist(
    set => ({
      subjectId: 'self',
      setSubjectId: id => set({ subjectId: id }),
    }),
    { name: 'prayers.journeyProfile.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** The chosen person; the account holder when the choice is gone (a deleted profile). */
export function journeySubject(): CounselingSubject {
  const { self, subjects } = useSubjectsStore.getState();
  const id = useJourneyProfile.getState().subjectId;
  return (id !== 'self' && subjects.find(s => s.id === id)) || self;
}

/** The same choice, read inside a component. */
export function useJourneySubject(): CounselingSubject {
  const id = useJourneyProfile(s => s.subjectId);
  const self = useSubjectsStore(s => s.self);
  const other = useSubjectsStore(s => (id === 'self' ? undefined : s.subjects.find(x => x.id === id)));
  return other ?? self;
}

/** The phone-side twin of the server's profile key — birth date, clock, gender — for keeping the
 *  records of different people's rides apart. '' for the account holder, whose records predate it. */
export function journeyProfileKey(subject: CounselingSubject = journeySubject()): string {
  if (subject.id === 'self' || subject.isUser) return '';
  return `${subject.birthDate ?? ''} ${subject.birthTime || '--:--'} ${subject.gender?.[0]?.toUpperCase() ?? ''}`;
}

/** A per-journey record key scoped to the person: the plain journey id for the account holder. */
export const scopedJourneyKey = (journeyId: string, profileKey = journeyProfileKey()) =>
  profileKey ? `${journeyId}@${profileKey}` : journeyId;

/** For the records a ride leaves (saved journey, 아카이브 rows): whose it was. Empty for the account
 *  holder, so their records keep the keys they always had. */
export function journeyWho(): { profileKey?: string; subjectName?: string } {
  const subject = journeySubject();
  const profileKey = journeyProfileKey(subject);
  return profileKey ? { profileKey, subjectName: subject.displayName } : {};
}

/** Reopening a saved ride (아카이브): make its person the chosen one again, so the result, the report
 *  and any unlock made from there are theirs. A person no longer in the profiles falls back to the
 *  account holder. */
export function selectJourneyProfile(profileKey?: string) {
  const { subjects } = useSubjectsStore.getState();
  const match = profileKey ? subjects.find(s => journeyProfileKey(s) === profileKey) : undefined;
  useJourneyProfile.getState().setSubjectId(match?.id ?? 'self');
}
