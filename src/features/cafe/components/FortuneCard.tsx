import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const safe = useSafeAreaInsets();
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
    // Low on the screen, not over the middle: the player sits there and was hidden behind it (29-10).
    <View style={[styles.scrim, { paddingBottom: safe.bottom + spacing.xl }]} testID="cafe-fortune">
      <Animated.View style={[styles.paper, unfold]}>
        {/* The slip's printed edge: a hairline frame just inside the paper's own. */}
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.title}>{t('cafe.coffee.fortune')}</Text>
        <View style={styles.rule}>
          <View style={styles.ruleLine} />
          <Text style={styles.ruleMark}>✦</Text>
          <View style={styles.ruleLine} />
        </View>
        <Animated.View style={[styles.words, words]}>
          {/* hangul-word: a Korean fortune wraps between words, never inside one (부드/럽게). */}
          <Text style={styles.text} lineBreakStrategyIOS="hangul-word" testID="cafe-fortune-text">{text}</Text>
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

const GOLD_INK = '#8A6A2B';

const styles = StyleSheet.create({
  scrim: { ...absoluteFill, alignItems: 'center', justifyContent: 'flex-end', padding: spacing.xl, backgroundColor: 'rgba(6,5,20,0.3)' },
  paper: {
    width: '100%', maxWidth: 300, paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, backgroundColor: PAPER, borderWidth: 1, borderColor: colors.gold, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  frame: {
    ...absoluteFill, margin: 6, borderRadius: radius.lg - 6, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(138,106,43,0.45)',
  },
  title: { fontFamily: SERIF, fontSize: 12, color: GOLD_INK, letterSpacing: 2 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, width: 96 },
  ruleLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(138,106,43,0.6)' },
  ruleMark: { fontSize: 10, color: GOLD_INK },
  words: { marginTop: spacing.md, marginBottom: spacing.lg },
  text: { fontFamily: SERIF, fontSize: 16, lineHeight: 25, color: INK, textAlign: 'center' },
  close: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minWidth: 132, minHeight: 40, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  closeText: { ...typography.bodyStrong, color: INK },
  pressed: { opacity: 0.75 },
});
