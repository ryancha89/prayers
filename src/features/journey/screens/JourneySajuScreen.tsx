import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { hasBirthData } from '../../subjects/store/subjectsStore';
import { SajuChartPanel, useSajuChart } from '../../saju/components/SajuChartPanel';
import { JOURNEYS, journeyAfterProfile } from '../data/journeys';
import { useJourneySubject } from '../store/journeyProfileStore';
import { column } from '../../../shared/device/screen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'JourneySaju'>;

/**
 * The journey's second step (10-12): the chosen person's saju — birth data, the four pillars, the
 * five elements, 대운 and 세운 — before the guide is picked. The year the train reads is built on
 * exactly this chart, so the player sees whose year it is going to be.
 */
export const JourneySajuScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const journey = JOURNEYS[params.journeyId];
  const who = useJourneySubject();
  const chart = useSajuChart(who.birthDate, who.birthTime);
  if (!journey) return null;

  const isSelf = who.id === 'self' || who.isUser;
  const depart = () => {
    sfx.select();
    navigation.navigate(journeyAfterProfile(journey), { journeyId: journey.id });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            sfx.back();
            navigation.goBack();
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, column]} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
        <Text style={styles.title}>
          {isSelf ? t('journey.saju.titleSelf') : t('journey.saju.title', { name: who.displayName })}
        </Text>
        <Text style={styles.sub}>{t('journey.saju.sub', { year: journey.year })}</Text>

        <View style={styles.card}>
          <Field label={t('addSubject.name')} value={isSelf ? who.displayName || t('subject.myself') : who.displayName} />
          <Field label={t('addSubject.birthDate')} value={who.birthDate || '—'} />
          <Field
            label={t('myInfo.birthTime')}
            value={
              who.birthTime
                ? `${who.birthTime}${chart?.summerTime ? ` · ${t('myInfo.summerTag')}` : ''}`
                : t('myInfo.timeUnknown')
            }
          />
          <Field
            label={t('addSubject.gender')}
            value={who.gender ? t(who.gender === 'male' ? 'addSubject.male' : 'addSubject.female') : '—'}
            last
          />
        </View>

        {hasBirthData(who) && (
          <SajuChartPanel
            person={{ birthDate: who.birthDate!, birthTime: who.birthTime, gender: who.gender! }}
            other={!isSelf}
          />
        )}
      </ScrollView>
      <View style={[styles.footer, column]}>
        <PrimaryButton label={t('journey.saju.depart')} onPress={depart} disabled={!hasBirthData(who)} />
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3, marginTop: spacing.md },
  title: { ...typography.hero, color: colors.textPrimary, marginTop: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  fieldDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  fieldLabel: { ...typography.body, color: colors.textSecondary },
  fieldValue: { ...typography.bodyStrong, color: colors.textPrimary },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
});
