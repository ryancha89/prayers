import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { SajuChartPanel, useSajuChart } from '../../saju/components/SajuChartPanel';
import { column } from '../../../shared/device/screen';
import { zodiacOf } from '../../saju/zodiac';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * 내 정보: the account holder's own birth data and the saju it makes — pillars, elements, 대운 and
 * 세운 (`SajuChartPanel`, the same panel the 2027 journey shows for whoever rides).
 *
 * The pillars are computed on the phone with the same `chart.ts` the 아카이브 uses for other
 * people, so the chart shown here is the one the player would see for themselves anywhere else.
 * Editing still happens in the AddSubject form — this screen only reads `self`.
 */
export const MyInfoScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const self = useSubjectsStore(s => s.self);
  const ready = hasBirthData(self);
  const chart = useSajuChart(self.birthDate, self.birthTime, self.birthPlace);
  const zodiac = zodiacOf(self.birthDate);

  const edit = () => {
    sfx.tap();
    navigation.navigate('AddSubject', { subjectId: 'self' });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            sfx.tap();
            navigation.goBack();
          }}
          hitSlop={12}>
          <Icon name="back" size={22} />
        </Pressable>
        <Text style={styles.title}>{t('addSubject.myProfile')}</Text>
        <Pressable onPress={edit} hitSlop={12}>
          <Icon name="pen" size={20} color={colors.violetSoft} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, column]} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Field label={t('addSubject.name')} value={self.displayName} />
          <Field label={t('addSubject.birthDate')} value={self.birthDate || '—'} />
          <Field label={t('myInfo.zodiac')} value={zodiac ? `${zodiac.glyph} ${t(zodiac.label)}` : '—'} />
          <Field
            label={t('myInfo.birthTime')}
            value={
              self.birthTime
                ? `${self.birthTime}${chart?.summerTime ? ` · ${t('myInfo.summerTag')}` : ''}`
                : t('myInfo.timeUnknown')
            }
          />
          <Field
            label={t('addSubject.gender')}
            value={self.gender ? t(self.gender === 'male' ? 'addSubject.male' : 'addSubject.female') : '—'}
          />
          <Field label="MBTI" value={self.mbti ?? '—'} last />
        </View>

        {!ready || !chart ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('myInfo.noChart')}</Text>
            <PrimaryButton label={t('addSubject.editSelf')} onPress={edit} style={styles.emptyBtn} />
          </View>
        ) : (
          <SajuChartPanel person={{ birthDate: self.birthDate!, birthTime: self.birthTime, birthPlace: self.birthPlace, gender: self.gender! }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Field: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View style={[styles.field, !last && styles.fieldDivider]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  fieldDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  fieldLabel: { ...typography.body, color: colors.textSecondary },
  fieldValue: { ...typography.bodyStrong, color: colors.textPrimary },
  empty: { alignItems: 'center', gap: spacing.lg, marginTop: spacing.xl, padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch' },
});
