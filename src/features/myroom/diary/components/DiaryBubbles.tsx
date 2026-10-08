import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { CompassStar } from '../../../../shared/components/Ornaments';

/**
 * The PLAYER's bubble — their name, the HUD's compass emblem, and their OWN words (an excerpt of the
 * page). The diary is the player's (08-10, Jeongmin), so its screens show whose page it is; what the
 * counsellor wrote back goes in a ReflectionNote under it, never in this bubble, so nobody seems to
 * say what they did not.
 */
export const UserBubble: React.FC<{ name: string; text: string; lines?: number; testID?: string }> = ({
  name, text, lines, testID,
}) => (
  <View style={styles.row}>
    <View style={[styles.face, styles.emblem]} testID={testID ? `${testID}-face` : undefined}>
      <CompassStar size={44} />
    </View>
    <View style={styles.bubble}>
      {!!name && <Text style={styles.name} testID={testID ? `${testID}-name` : undefined}>{name}</Text>}
      <Text style={styles.text} numberOfLines={lines} testID={testID}>{text}</Text>
    </View>
  </View>
);

/**
 * The reflection on a page: a reply card under the player's bubble, with no portrait — "the diary is
 * for the user" — and a small star in place of a face. Pending shows a spinner beside the line.
 */
export const ReflectionNote: React.FC<{ title: string; text: string; busy?: boolean; muted?: boolean; indent?: boolean; testID?: string }> = ({
  title, text, busy, muted, indent = true, testID,
}) => (
  <View style={[styles.note, !indent && styles.noteFlush]} accessibilityLiveRegion="polite">
    <View style={styles.noteHead}>
      <CompassStar size={16} />
      <Text style={styles.noteTitle} accessibilityRole="header">{title}</Text>
    </View>
    <View style={styles.line}>
      {busy && <ActivityIndicator size="small" color={colors.gold} />}
      <Text style={[styles.noteText, muted && styles.noteMuted]} testID={testID}>{text}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  emblem: { backgroundColor: '#15122E', alignItems: 'center', justifyContent: 'center' },
  note: {
    marginLeft: 64 + spacing.md, padding: spacing.md, gap: spacing.xs, borderRadius: radius.md, borderTopLeftRadius: 4,
    backgroundColor: 'rgba(233,196,106,0.10)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  noteFlush: { marginLeft: 0 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteTitle: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  noteText: { ...typography.body, color: colors.textPrimary, lineHeight: 22, flex: 1 },
  noteMuted: { color: colors.textSecondary },
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
