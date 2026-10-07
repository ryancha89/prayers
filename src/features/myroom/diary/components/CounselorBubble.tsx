import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import type { CounselorSummary } from '../../../counselors/types';

/** The counsellor's portrait with a speech bubble beside it (the Diary Saved mockup). */
export const CounselorBubble: React.FC<{ counselor?: CounselorSummary; text: string; busy?: boolean; testID?: string }> = ({
  counselor, text, busy, testID,
}) => (
  <View style={styles.row}>
    {counselor?.avatarImage ? (
      <Image source={counselor.avatarImage} style={styles.face} />
    ) : (
      <View style={[styles.face, { backgroundColor: counselor?.accent ?? colors.violet }]} />
    )}
    <View style={styles.bubble}>
      {!!counselor && <Text style={styles.name}>{counselor.name}</Text>}
      <View style={styles.line}>
        {busy && <ActivityIndicator size="small" color={colors.gold} />}
        <Text style={styles.text} testID={testID}>{text}</Text>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  face: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.gold },
  bubble: {
    flex: 1, padding: spacing.md, borderRadius: radius.md, borderTopLeftRadius: 4,
    backgroundColor: '#F7F0E1',
  },
  name: { ...typography.tiny, color: '#7A5A1E', marginBottom: 2 },
  line: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  text: { ...typography.body, color: '#2A2140', lineHeight: 22, flex: 1 },
});
