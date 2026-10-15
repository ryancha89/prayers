import type { CounselingSubject, UnitySubject } from '../types';

/** A subject as the room is told about it — inline birth data (Unity RNSubject). */
export const unitySubjectOf = (s: CounselingSubject): UnitySubject => ({
  id: s.id,
  displayName: s.displayName,
  birthDate: s.birthDate,
  birthTime: s.birthTime,
  gender: s.gender,
  ...(s.relationship ? { relationship: s.relationship } : {}),
});

/**
 * Subject + holder for the room. The account holder's own chart is the ground the reading stands
 * on (10-13: "내 사주를 기준으로 하고 다른 사주 선택하면 이 사주의 지인을 상담하는 거구나"): anyone
 * else goes out WITH the holder, so the counsellor reads them as the holder's acquaintance.
 */
export function roomSubjects(subject: CounselingSubject, self: CounselingSubject): { subject: UnitySubject; holder?: UnitySubject } {
  if (subject.id === 'self' || !self.birthDate) return { subject: unitySubjectOf(subject) };
  return { subject: unitySubjectOf(subject), holder: unitySubjectOf(self) };
}
