import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '../theme';

/** Small pill used for hashtags / specialties. */
export const Tag: React.FC<{ label: string; tone?: 'violet' | 'muted' | 'gold' }> = ({
  label,
  tone = 'muted',
}) => {
  const bg =
    tone === 'violet' ? colors.violetDim : tone === 'gold' ? colors.goldDim : 'rgba(255,255,255,0.06)';
  const fg =
    tone === 'violet' ? colors.violetSoft : tone === 'gold' ? colors.gold : colors.textSecondary;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
