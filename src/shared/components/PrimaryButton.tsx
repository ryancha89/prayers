import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

/** Dominant CTA used for "Start Counseling" and other primary actions (spec §13). */
export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'violet' | 'ghost';
  style?: ViewStyle;
}> = ({ label, onPress, loading, disabled, tone = 'violet', style }) => {
  const isGhost = tone === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isGhost ? styles.ghost : styles.violet,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[styles.label, isGhost && styles.ghostLabel]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  violet: { backgroundColor: colors.violet },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.violet },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { ...typography.h3, color: '#FFFFFF' },
  ghostLabel: { color: colors.violetSoft },
});
