import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { CounselingSubject } from '../../counseling/types';

export const SubjectCard: React.FC<{
  subject: CounselingSubject;
  selected: boolean;
  onPress: () => void;
}> = ({ subject, selected, onPress }) => {
  const t = useT();
  return (
  <Pressable onPress={onPress} style={[styles.row, selected && styles.selected]}>
    <View style={[styles.avatar, subject.isUser && styles.avatarSelf]}>
      <Icon name="person" size={20} color={subject.isUser ? '#FFFFFF' : colors.textSecondary} />
    </View>
    <View style={styles.info}>
      <Text style={styles.name}>{subject.isUser ? t('subject.myself') : subject.displayName}</Text>
      {!!subject.birthDate && <Text style={styles.meta}>{subject.birthDate}</Text>}
    </View>
    {selected && <Icon name="sparkle" size={16} color={colors.violet} />}
  </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelf: { backgroundColor: colors.violet },
  info: { flex: 1 },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
