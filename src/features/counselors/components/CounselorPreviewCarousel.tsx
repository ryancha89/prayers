import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { Icon } from '../../../shared/components/Icon';
import { CounselorPreview } from '../types';

/**
 * Short pre-rendered action previews (spec §12). Tapping "plays" the clip in a
 * lightweight placeholder — it must NOT launch Unity (spec §12 explicit rule).
 * Replace the placeholder tile with react-native-video when clips are bundled.
 */
export const CounselorPreviewCarousel: React.FC<{
  previews: CounselorPreview[];
  accent: string;
}> = ({ previews, accent }) => {
  const [active, setActive] = useState<string>(previews[0]?.id ?? '');

  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { backgroundColor: accent }]}>
        <Icon name="play" size={34} color="rgba(255,255,255,0.9)" />
        <Text style={styles.stageLabel}>
          {previews.find(p => p.id === active)?.label ?? 'Preview'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {previews.map(p => {
          const isActive = p.id === active;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActive(p.id)}
              style={[styles.chip, isActive && styles.chipActive]}>
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  stage: {
    height: 180,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  stageLabel: { ...typography.bodyStrong, color: 'rgba(255,255,255,0.95)' },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.violetDim },
  chipLabel: { ...typography.caption, color: colors.textSecondary },
  chipLabelActive: { color: colors.violetSoft, fontWeight: '700' },
});
