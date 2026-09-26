import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { CounselorPreview } from '../types';
import { PREVIEW_ASPECT, PREVIEW_FPS, PREVIEW_FRAMES } from '../assets/previews';
import { SpriteStrip } from './SpriteStrip';
import { PixelCatClip } from '../../counseling/pixel/PixelCatClip';
import { sfx } from '../../../shared/audio/sfx';

/**
 * Short action previews (spec §12). It must NOT launch Unity (spec §12 explicit rule) — and it no
 * longer needs to: each action plays a sprite strip rendered ahead of time from the counselor's own
 * 3D model and its own animation clip, so what you see here is what the room will show you.
 *
 * A counselor with no model has nothing to render. It used to show a play button over an accent
 * block for those, which promised a clip that did not exist and never would until the model was
 * built; now it says that plainly. Same reason the card art was redrawn from the models.
 */
export const CounselorPreviewCarousel: React.FC<{
  previews: CounselorPreview[];
  accent: string;
}> = ({ previews, accent }) => {
  const t = useT();
  const [active, setActive] = useState<string>(previews[0]?.id ?? '');
  const current = previews.find(p => p.id === active) ?? previews[0];

  return (
    <View style={styles.wrap}>
      {current?.pixelClip ? (
        <PixelCatClip clip={current.pixelClip} borderRadius={radius.lg} />
      ) : current?.strip ? (
        <SpriteStrip
          source={current.strip}
          frames={PREVIEW_FRAMES}
          aspect={PREVIEW_ASPECT}
          fps={PREVIEW_FPS}
          borderRadius={radius.lg}
        />
      ) : (
        <View style={[styles.empty, { borderColor: accent }]}>
          <Text style={styles.emptyText}>{t('detail.previewComingSoon')}</Text>
        </View>
      )}

      {/* The chips stay even with no clip: they still say what this counselor will be able to do. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {previews.map(p => {
          const isActive = p.id === active;
          // `!!`: a required() asset is a NUMBER under Metro, and `0` would land in a style array.
          const hasClip = !!p.strip || !!p.pixelClip;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                sfx[isActive ? 'tap' : 'select']();
                setActive(p.id);
              }}
              disabled={!hasClip}
              style={[
                styles.chip,
                isActive && hasClip && styles.chipActive,
                !hasClip && styles.chipDim,
              ]}>
              <Text style={[styles.chipLabel, isActive && hasClip && styles.chipLabelActive]}>
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
  empty: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.violet },
  chipDim: { opacity: 0.45 },
  chipLabel: { ...typography.caption, color: colors.textSecondary },
  chipLabelActive: { color: '#FFFFFF' },
});
