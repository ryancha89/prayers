import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import type { Chapter } from '../types';

/**
 * The line the train is on: a station per chapter, the ones behind lit, the current one glowing,
 * the ones ahead dim. Tapping a station travels there.
 */
export const RailwayProgress: React.FC<{
  chapters: Chapter[];
  current: number;
  /** 0-1 through the current chapter — the train's place on the track between two stations. */
  progress: number;
  onStation?: (index: number) => void;
}> = ({ chapters, current, progress, onStation }) => {
  const t = useT();
  const last = chapters.length - 1;
  const fill = last > 0 ? Math.min(1, (current + Math.min(1, progress)) / last) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={styles.rail} />
        <View style={[styles.railLit, { width: `${fill * 100}%` }]} />
        {chapters.map((c, i) => {
          const state = i < current ? 'past' : i === current ? 'now' : 'ahead';
          return (
            <Pressable
              key={c.id}
              hitSlop={10}
              onPress={() => onStation?.(i)}
              style={[styles.stop, { left: `${(i / last) * 100}%` }]}
              accessibilityRole="button"
              accessibilityLabel={t(c.title)}>
              <View style={[styles.dot, state === 'past' && styles.dotPast, state === 'now' && styles.dotNow]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.labels}>
        {chapters.map((c, i) => (
          <Text
            key={c.id}
            numberOfLines={1}
            style={[styles.label, i === current && styles.labelNow, { left: `${(i / last) * 100}%` }]}>
            {t(c.title)}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Wide enough that the end stations' labels (56 pt, centred on the dot) are not cut by the screen.
  wrap: { paddingHorizontal: 34, paddingBottom: 4 },
  track: { height: 18, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  railLit: { position: 'absolute', left: 0, height: 2, backgroundColor: colors.gold },
  stop: { position: 'absolute', width: 18, height: 18, marginLeft: -9, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3A3550' },
  dotPast: { backgroundColor: colors.gold },
  dotNow: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.gold,
    borderWidth: 3, borderColor: 'rgba(233,196,106,0.35)',
    shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  labels: { height: 18, marginTop: 4 },
  label: { position: 'absolute', width: 56, marginLeft: -28, textAlign: 'center', ...typography.tiny, color: colors.textMuted },
  labelNow: { color: colors.gold },
});
