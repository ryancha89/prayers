import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { SERIF } from '../../../shared/components/hud/Hud';

/** The unfold: long enough to read as the paper coming out of the cookie, short enough not to wait. */
export const FORTUNE_OPEN_MS = 520;

/**
 * The fortune from the cookie the player just cracked (CAFE_COOKIE_OPENED). Unity plays the crack;
 * this is the slip of paper that comes out of it: it unfolds from a sliver to a card — width first,
 * then the words fade in — and stays until it is closed.
 */
export const FortuneCard: React.FC<{ text: string; onClose: () => void }> = ({ text, onClose }) => {
  const t = useT();
  const open = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(open, { toValue: 1, duration: FORTUNE_OPEN_MS, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [open]);
  const unfold = {
    opacity: open.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
    transform: [
      { scaleX: open.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) },
      { rotate: open.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
    ],
  };
  const words = { opacity: open.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] }) };
  return (
    <View style={styles.scrim} testID="cafe-fortune">
      <Animated.View style={[styles.paper, unfold]}>
        <Text style={styles.title}>{t('cafe.coffee.fortune')}</Text>
        <Animated.View style={words}>
          <Text style={styles.text} testID="cafe-fortune-text">{text}</Text>
        </Animated.View>
        <Pressable
          onPress={() => { sfx.tap(); onClose(); }}
          accessibilityRole="button"
          accessibilityLabel={t('cafe.coffee.close')}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="check" size={16} color={INK} />
          <Text style={styles.closeText}>{t('cafe.coffee.close')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const INK = '#1A1330';
const PAPER = '#FBF3E2';

const styles = StyleSheet.create({
  scrim: { ...absoluteFill, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(6,5,20,0.45)' },
  paper: {
    width: '100%', maxWidth: 340, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md,
    borderRadius: radius.md, backgroundColor: PAPER, borderWidth: 1, borderColor: colors.gold, alignItems: 'center',
  },
  title: { fontFamily: SERIF, fontSize: 15, color: '#8A6A2B', letterSpacing: 0.6 },
  text: { fontFamily: SERIF, fontSize: 18, lineHeight: 26, color: INK, textAlign: 'center' },
  close: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
    borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  closeText: { ...typography.bodyStrong, color: INK },
  pressed: { opacity: 0.75 },
});
