import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { relativeTime } from '../../../shared/utils/time';
import { useLang, useT } from '../../../shared/i18n';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { ConversationSummary } from '../types';

export const ConversationRow: React.FC<{
  conversation: ConversationSummary;
  onPress: () => void;
}> = ({ conversation, onPress }) => {
  const t = useT();
  const lang = useLang();
  // Re-derive from the counselor id so the list follows the language — and so the face comes from
  // the roster rather than being copied into every stored conversation, where it would go stale
  // the moment a counselor's art is redrawn.
  const counselor = getLocalizedCounselor(conversation.counselorId, lang);
  const name = counselor?.name ?? conversation.counselorName;
  return (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={[styles.portrait, { backgroundColor: conversation.counselorAccent }]}>
      {counselor?.avatarImage ? (
        <Image source={counselor.avatarImage} style={styles.portraitImg} />
      ) : (
        <Text style={styles.initial}>{name.charAt(0)}</Text>
      )}
    </View>
    <View style={styles.body}>
      <View style={styles.topLine}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.time}>{relativeTime(conversation.updatedAt)}</Text>
      </View>
      <Text style={styles.last} numberOfLines={1}>
        {conversation.lastMessage || t('conv.tapToContinue')}
      </Text>
    </View>
  </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.card },
  portraitImg: { width: '100%', height: '100%' },
  portrait: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 24, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  body: { flex: 1, gap: 4 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { ...typography.h3, color: colors.textPrimary },
  time: { ...typography.tiny, color: colors.textMuted },
  last: { ...typography.caption, color: colors.textSecondary },
});
