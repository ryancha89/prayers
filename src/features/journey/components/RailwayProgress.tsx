import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import type { Chapter, JourneyContent } from '../types';

/** What a station's paid stretches look like from here: none sold, none open, some, or all. */
type Paid = 'free' | 'locked' | 'partial' | 'open';

function paidOf(content: JourneyContent | null | undefined, chapterId: string): Paid {
  const paid = content?.chapters.find(c => c.id === chapterId)?.parts?.filter(p => p.momentId) ?? [];
  if (!paid.length) return 'free';
  const open = paid.filter(p => p.unlocked).length;
  return open === 0 ? 'locked' : open === paid.length ? 'open' : 'partial';
}

/**
 * The line the train is on: a dot per station, the ones behind lit, the current one glowing, the
 * ones ahead dim (mockup panel 3: 출발역 사회운 재물운 연애운 건강운 종합운 월운). Tapping a station
 * travels there, ahead or behind. A station marked `hideOnRail` (the end of the line) is not drawn.
 *
 * Each station's name is a button with its lock state on it (10-13: "단계 건너뛰고 원하는 챕터만
 * 해금"): the dots alone were 8 pt and nobody found out they could be tapped, so the ride read as a
 * fixed order in which 사회운 had to be bought before 재물운. Nothing was ever withheld from travel —
 * this only makes the jump visible.
 */
export const RailwayProgress: React.FC<{
  chapters: Chapter[];
  current: number;
  /** 0-1 through the current chapter — the train's place on the track between two stations. */
  progress: number;
  /** The told journey, for each station's lock state. Absent = no lock marks. */
  content?: JourneyContent | null;
  onStation?: (index: number) => void;
}> = ({ chapters: all, current: currentIndex, progress, content, onStation }) => {
  const t = useT();
  // Positions on the rail count only the drawn stations; taps answer with the journey's index.
  const chapters = all.map((c, i) => ({ ...c, at: i })).filter(c => !c.hideOnRail);
  const current = Math.min(chapters.length - 1, chapters.filter(c => c.at < currentIndex).length - (chapters.some(c => c.at === currentIndex) ? 0 : 1));
  const last = chapters.length - 1;
  const fill = last > 0 ? Math.min(1, (current + Math.min(1, progress)) / last) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={styles.rail} />
        <View style={[styles.railLit, { width: `${fill * 100}%` }]} />
      </View>
      {chapters.map((c, i) => {
        const state = i < current ? 'past' : i === current ? 'now' : 'ahead';
        const paid = content ? paidOf(content, c.id) : 'free';
        return (
          <Pressable
            key={c.id}
            hitSlop={6}
            onPress={() => onStation?.(c.at)}
            style={({ pressed }) => [styles.stop, { left: `${(i / last) * 100}%` }, pressed && styles.stopPressed]}
            accessibilityRole="button"
            accessibilityLabel={t(c.title)}>
            <View style={styles.dotBox}>
              <View style={[styles.dot, state === 'past' && styles.dotPast, state === 'now' && styles.dotNow]} />
            </View>
            <View style={[styles.chip, state === 'now' && styles.chipNow, paid === 'open' && styles.chipOpen]}>
              {paid === 'locked' || paid === 'partial' ? (
                <Icon name="lock" size={9} color={paid === 'partial' ? colors.gold : colors.textMuted} />
              ) : null}
              <Text numberOfLines={1} style={[styles.label, (state === 'now' || paid === 'open') && styles.labelNow]}>
                {t(c.title)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const STOP_W = 52;

const styles = StyleSheet.create({
  // Wide enough that the end stations' chips (52 pt, centred on the dot) are not cut by the screen.
  wrap: { marginHorizontal: 32, height: 50, marginBottom: 4 },
  track: { position: 'absolute', left: 0, right: 0, top: 0, height: 18, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  railLit: { position: 'absolute', left: 0, height: 2, backgroundColor: colors.gold },
  stop: { position: 'absolute', top: 0, width: STOP_W, marginLeft: -STOP_W / 2, alignItems: 'center' },
  stopPressed: { opacity: 0.6 },
  dotBox: { height: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3A3550' },
  dotPast: { backgroundColor: colors.gold },
  dotNow: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.gold,
    borderWidth: 3, borderColor: 'rgba(233,196,106,0.35)',
    shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  chip: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipNow: { borderColor: colors.gold, backgroundColor: 'rgba(233,196,106,0.14)' },
  chipOpen: { borderColor: 'rgba(233,196,106,0.5)' },
  label: { ...typography.tiny, color: colors.textSecondary, flexShrink: 1 },
  labelNow: { color: colors.gold },
});
