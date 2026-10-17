import React from 'react';
import { FeatureCard } from '../../../shared/components/FeatureCard';
import { useT } from '../../../shared/i18n';
import { LECTURE_COUNT, SCHOPENHAUER_ART } from '../data/lecture';
import { useLectureProgress } from '../store/lectureProgress';

/**
 * Home's way into the Schopenhauer series (the 강의 tab, and 전체): what it is (free, twelve
 * lectures), how far the listener has got, and "강의 듣기" — or "3강 이어서 듣기" once they have
 * started. `onOpen(chapter, line)` opens the lecture at that place.
 */
export const LectureSeriesCard: React.FC<{ onOpen(chapter: number, line: number): void }> = ({ onOpen }) => {
  const t = useT();
  const done = useLectureProgress(s => s.done);
  const at = useLectureProgress(s => s.at);
  const total = LECTURE_COUNT;
  // Where to pick up: the line left on — or, when that chapter was heard to the end, the start of
  // the next one (and nothing once the last is done: the series starts over).
  // All twelve heard: the series starts over ("강의 듣기"), not "10강 이어서".
  const resume = !at || done.length >= total ? null
    : !done.includes(at.chapter) ? at
    : at.chapter < total ? { chapter: at.chapter + 1, line: 0 }
    : null;

  return (
    <FeatureCard
      testID="lecture-series-card"
      image={SCHOPENHAUER_ART.portrait}
      badge={t('lecture.badge')}
      title={t('lecture.series')}
      tagline={t('lecture.tagline')}
      cta={resume ? t('lecture.resume', { no: resume.chapter }) : t('lecture.start')}
      progress={done.length > 0 ? { share: done.length / total, label: t('lecture.progress', { done: done.length, total }) } : undefined}
      onPress={() => onOpen(resume?.chapter ?? 1, resume?.line ?? 0)}
    />
  );
};
