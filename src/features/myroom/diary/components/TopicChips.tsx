import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { topicKey } from '../text';

/** The reflection's topics, by the server's ids (spec 006 R8); an id the app has no name for yet
 *  reads as a neutral "Other" chip rather than a raw id. */
export const TopicChips: React.FC<{ topics: string[]; small?: boolean }> = ({ topics, small }) => {
  const t = useT();
  if (topics.length === 0) return null;
  return (
    <View style={styles.row}>
      {topics.slice(0, 3).map(id => (
        <View key={id} style={[styles.chip, small && styles.small]}>
          <Text style={[styles.text, small && styles.textSmall]}>#{t(topicKey(id) as TranslationKey)}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: 'rgba(167,139,250,0.16)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
  },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  text: { ...typography.caption, color: colors.violetSoft, fontWeight: '700' },
  textSmall: { ...typography.tiny },
});
