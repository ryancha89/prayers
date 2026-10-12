import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon, type IconName } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { useScreen } from '../../../../shared/device/screen';
import { MYROOM_LIFT } from '../../components/ItemPrompt';
import { INK } from './diaryTheme';

/**
 * At the desk, with the camera on the open book (08-10): the page itself is the reading — the
 * newest entry, on the 3D book — and these three are the ways on. Read opens My Diary (every entry),
 * Write a new page, Back returns the camera. Opening the book used to go straight to Write, which
 * left a player who only wanted to look no way to do that from the desk.
 *
 * Where the room's one action button docks (bottom centre, MYROOM_LIFT), which it replaces while
 * the book is open.
 */
export const DiaryBookBar: React.FC<{ onRead(): void; onWrite(): void; onBack(): void }> = ({ onRead, onWrite, onBack }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  const landscape = useScreen().landscape;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [pop]);

  const button = (key: TranslationKey, icon: IconName, onPress: () => void, testID: string, primary = false, back = false) => (
    <Pressable
      testID={testID}
      onPress={() => { if (back) sfx.back(); else sfx.select(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={t(key)}
      style={({ pressed }) => [styles.pill, primary ? styles.gold : styles.ivory, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={INK} />
      <Text style={styles.label} numberOfLines={1}>{t(key)}</Text>
    </Pressable>
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      testID="diary-book-bar"
      style={[
        styles.row,
        {
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom + (landscape ? MYROOM_LIFT.landscape : MYROOM_LIFT.portrait),
          opacity: pop,
          transform: [{ scale: pop }],
        },
      ]}>
      {button('myroom.act.back', 'back', onBack, 'diary-book-back', false, true)}
      {button('diary.book.read', 'book', onRead, 'diary-book-read')}
      {button('myroom.act.write', 'pen', onWrite, 'diary-book-write', true)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, flexShrink: 1, minHeight: 44,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  ivory: { backgroundColor: '#F6EEDD' },
  gold: { backgroundColor: colors.gold },
  label: { ...typography.bodyStrong, color: INK, flexShrink: 1 },
  pressed: { opacity: 0.75 },
});
