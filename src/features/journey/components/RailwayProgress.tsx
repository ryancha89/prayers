import React, { useState } from 'react';
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
 *
 * COMPACT when the stations are closer than a chip is wide (29-10, SE 3 sideways: the side panel gave
 * eight stations ~30 pt each and the chips piled on each other): only the current station keeps its
 * name; the rest are their dot, with a small lock under it where something is still for sale. Every
 * dot stays a button.
 *
 * 29-10, later: the first cut went compact below 56 pt a station, which caught every upright iPhone
 * (13–16: 326/6 = 54 pt; SE: 52) — phones that had always shown every name. A slot now shrinks to the
 * spacing (so chips never overlap) and the rail goes compact only below MIN_CHIP_W, the narrowest chip
 * that still reads (lock + two glyphs). The one name is a label, not a button, and stops short of the
 * neighbours' locks: as an opaque 110 pt button it hid them and caught the taps meant for their dots,
 * and a tap there restarted the current station mid-narration.
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
  const [width, setWidth] = useState(0);
  const spacing = width > 0 && last > 0 ? width / last : Infinity;
  // A chip as wide as the gap between two dots less a hair, so neighbours never touch.
  const slot = Math.min(STOP_W, spacing - CHIP_GAP);
  const compact = slot < MIN_CHIP_W;
  // Compact slots tile the rail exactly; only the vertical slop stays, so no slot reaches a neighbour's.
  const slop = compact ? { top: 6, bottom: 6, left: 0, right: 0 } : 6;
  const slotW = compact ? spacing : slot;
  return (
    <View style={styles.wrap} onLayout={e => setWidth(e.nativeEvent.layout.width)} testID="railway">
      <View style={styles.track}>
        <View style={styles.rail} />
        <View style={[styles.railLit, { width: `${fill * 100}%` }]} />
      </View>
      {compact && chapters[current] ? (() => {
        // The one name, centred on its dot, kept inside the rail's margins (the wrap's 32 pt) and
        // short of either neighbour's lock (half a 9 pt icon + a gap). Toward an end of the line there
        // is no neighbour, only the margin.
        const c = chapters[current];
        const paid = content ? paidOf(content, c.id) : 'free';
        const x = (current / last) * width;
        const reach = Math.min(NAME_W / 2, spacing - LOCK_CLEAR);
        const left = Math.max(-32, x - (current > 0 ? reach : NAME_W / 2));
        const right = Math.min(width + 32, x + (current < last ? reach : NAME_W / 2));
        return (
          // Not a button: taps fall through to the dot slots under it (the current one's included).
          <View key="now" pointerEvents="none" style={[styles.nowName, { left, width: right - left }]}
            testID="railway-now">
            <View style={[styles.chip, styles.chipNow, paid === 'open' && styles.chipOpen, styles.chipSolid]}>
              {paid === 'locked' || paid === 'partial' ? (
                <Icon name="lock" size={9} color={paid === 'partial' ? colors.gold : colors.textMuted} />
              ) : null}
              <Text numberOfLines={1} style={[styles.label, styles.labelNow]}>{t(c.title)}</Text>
            </View>
          </View>
        );
      })() : null}
      {chapters.map((c, i) => {
        const state = i < current ? 'past' : i === current ? 'now' : 'ahead';
        const paid = content ? paidOf(content, c.id) : 'free';
        return (
          <Pressable
            key={c.id}
            hitSlop={slop}
            onPress={() => onStation?.(c.at)}
            style={({ pressed }) => [styles.stop, { left: `${(i / last) * 100}%`, width: slotW, marginLeft: -slotW / 2 },
              pressed && styles.stopPressed]}
            accessibilityRole="button"
            accessibilityLabel={t(c.title)}>
            <View style={styles.dotBox}>
              <View style={[styles.dot, state === 'past' && styles.dotPast, state === 'now' && styles.dotNow]} />
            </View>
            {compact ? (
              state === 'now' ? (
                // Under the name label, so a tap on the name lands on its own station's slot.
                <View style={styles.lockOnly} />
              ) : paid === 'locked' || paid === 'partial' ? (
                <View style={styles.lockOnly} testID="railway-lock">
                  <Icon name="lock" size={9} color={paid === 'partial' ? colors.gold : colors.textMuted} />
                </View>
              ) : null
            ) : (
            <View style={[styles.chip, state === 'now' && styles.chipNow, paid === 'open' && styles.chipOpen]}>
              {paid === 'locked' || paid === 'partial' ? (
                <Icon name="lock" size={9} color={paid === 'partial' ? colors.gold : colors.textMuted} />
              ) : null}
              <Text numberOfLines={1} style={[styles.label, (state === 'now' || paid === 'open') && styles.labelNow]}>
                {t(c.title)}
              </Text>
            </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const STOP_W = 52;
/** Space kept between two neighbouring chips. */
const CHIP_GAP = 2;
/**
 * The narrowest chip that still reads: 1 pt border + 5 pt padding each side (12), a 9 pt lock and its
 * 2 pt gap (11), and two 11 pt glyphs (22). Korean names are three glyphs, so they ellipsize from here
 * down; below it the rail goes compact. SE upright gives 51.8 - 2 = 49.8 and keeps its names.
 */
const MIN_CHIP_W = 45;
/** The compact rail's one name chip, at most. */
const NAME_W = 110;
/** How far the name stops short of a neighbour's dot: half the 9 pt lock under it, and 3 pt. */
const LOCK_CLEAR = 7.5;

const styles = StyleSheet.create({
  // Wide enough that the end stations' chips (52 pt, centred on the dot) are not cut by the screen.
  wrap: { marginHorizontal: 32, height: 50, marginBottom: 4 },
  track: { position: 'absolute', left: 0, right: 0, top: 0, height: 18, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  railLit: { position: 'absolute', left: 0, height: 2, backgroundColor: colors.gold },
  stop: { position: 'absolute', top: 0, alignItems: 'center' },
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
  // Compact: the current station's name, wider than a slot, laid over the row under the dots.
  nowName: { position: 'absolute', top: 18, alignItems: 'center', zIndex: 1 },
  lockOnly: { marginTop: 5, height: 22, justifyContent: 'center' },
  // Opaque over the rail; the name already stops short of a neighbour's lock.
  chipSolid: { backgroundColor: '#2A2440' },
  chipOpen: { borderColor: 'rgba(233,196,106,0.5)' },
  label: { ...typography.tiny, color: colors.textSecondary, flexShrink: 1 },
  labelNow: { color: colors.gold },
});
