import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { TRANSITION_MS } from '../player/journeyPlayer';

/**
 * Between stations: "다음 역은, 재물운입니다." — the window darkens as the train runs (the backdrop
 * speeds up under it), then clears on the new view. Timed to TRANSITION_MS; a video transition can
 * replace this component without the player changing.
 */
export const StationTransition: React.FC<{ station: TranslationKey; final: boolean }> = ({ station, final }) => {
  const t = useT();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(TRANSITION_MS - 1100),
      Animated.timing(a, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [a, station]);
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity: a }]}>
      <Text style={styles.small}>{t(final ? 'journey.arriving' : 'journey.nextStation')}</Text>
      <Text style={styles.big}>{t(station)}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,4,20,0.55)',
  },
  small: { ...typography.caption, color: colors.textSecondary, letterSpacing: 1 },
  big: { ...typography.hero, color: colors.gold, marginTop: 6 },
});
