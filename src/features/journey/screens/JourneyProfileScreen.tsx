import React, { useMemo, useState } from 'react';
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
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { SubjectCard } from '../../subjects/components/SubjectCard';
import { JOURNEYS } from '../data/journeys';
import { useJourneyProfile } from '../store/journeyProfileStore';
import { useJourneyPlayer } from '../player/journeyPlayer';
import { JourneyTrainArt } from '../components/JourneyTrainArt';
import { CoinPill } from '../../coins/components/CoinPill';
import { column } from '../../../shared/device/screen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'JourneyProfile'>;

/**
 * The journey's first step (10-12): "누구의 한 해를 볼까요?" — the player, or someone from their saved
 * profiles. The choice is remembered (journeyProfileStore) and every request of the ride carries
 * that person's birth data; the server keeps a journey per person. Next: their saju (JourneySaju),
 * then the guide.
 *
 * A profile without a birth date or gender goes to the form first — there is no chart to ride on.
 */
export const JourneyProfileScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const journey = JOURNEYS[params.journeyId];
  const self = useSubjectsStore(s => s.self);
  const subjects = useSubjectsStore(s => s.subjects);
  const others = useMemo(() => subjects.filter(s => !s.isUser), [subjects]);
  const remembered = useJourneyProfile(s => s.subjectId);
  const setSubjectId = useJourneyProfile(s => s.setSubjectId);
  // The last choice, if that person is still there.
  const [selectedId, setSelectedId] = useState(
    remembered === 'self' || others.some(o => o.id === remembered) ? remembered : 'self',
  );
  if (!journey) return null;

  const selected = selectedId === 'self' ? self : others.find(o => o.id === selectedId);
  const ready = hasBirthData(selected);

  const next = () => {
    if (!selected) return;
    sfx.select();
    if (!ready) {
      navigation.navigate('AddSubject', { subjectId: selected.id });
      return;
    }
    // A ride still open (the mini player) is someone else's year: end it rather than let its unlocks
    // and report go out under the new person.
    if (selected.id !== remembered) useJourneyPlayer.getState().stop();
    setSubjectId(selected.id);
    navigation.navigate('JourneySaju', { journeyId: journey.id });
  };

  const pick = (id: string) => {
    sfx.select();
    setSelectedId(id);
  };

  return (
    <View style={styles.root}>
      <View style={styles.sky}>
        <JourneyTrainArt fadeTo={colors.bg} />
      </View>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.flex}>
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
          <CoinPill />
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, column]}>
          <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
          <Text style={styles.title}>{t('journey.profile.title', { year: journey.year })}</Text>
          <Text style={styles.sub}>{t('journey.profile.sub')}</Text>

          <SubjectCard subject={self} selected={selectedId === 'self'} onPress={() => pick('self')} />

          <Text style={styles.groupLabel}>{t('subject.saved')}</Text>
          {others.map(o => (
            <SubjectCard key={o.id} subject={o} selected={selectedId === o.id} onPress={() => pick(o.id)} />
          ))}
          <Pressable
            style={styles.addRow}
            onPress={() => {
              sfx.tap();
              navigation.navigate('AddSubject');
            }}>
            <Icon name="plus" size={22} color={colors.violetSoft} />
            <Text style={styles.addLabel}>{t('subject.add')}</Text>
          </Pressable>
        </ScrollView>
        <View style={[styles.footer, column]}>
          <PrimaryButton
            label={ready ? t('journey.profile.continue') : t('subject.addDetails')}
            onPress={next}
            disabled={!selected}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, height: 320 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  scroll: { padding: spacing.xl, paddingTop: 150, gap: spacing.sm },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: { ...typography.hero, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  groupLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.card,
    borderStyle: 'dashed',
  },
  addLabel: { ...typography.bodyStrong, color: colors.violetSoft },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
});
