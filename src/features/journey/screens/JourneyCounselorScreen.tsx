import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { toneForCharacter } from '../../counseling/api/counselorAI';
import { isNativeUnity } from '../../counseling/bridge';
import { JOURNEYS } from '../data/journeys';
import { useJourneyPlayer } from '../player/journeyPlayer';
import { BEAT_LINES, prefetchBeatLines } from '../player/beatVoice';
import { JourneyTrainArt } from '../components/JourneyTrainArt';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'JourneyCounselor'>;

/**
 * "2027년, 누구와 함께 떠날까요?" — pick the guide. The reading is the same whoever it is (the server
 * computes it once); the voice, the words and the way it is told are theirs.
 */
export const JourneyCounselorScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const lang = useLang();
  const journey = JOURNEYS[params.journeyId];
  const board = useJourneyPlayer(s => s.board);
  if (!journey) return null;

  const pick = (counselorId: string) => {
    const c = getLocalizedCounselor(counselorId, lang);
    const tone = toneForCharacter(c?.characterId);
    if (!c || !tone) return;
    sfx.select();
    // The storyboard's lines go to the server BEFORE the reading does: line 1 is needed ~4 s after
    // the platform opens, the first chapter's narration only after the walk to the seat.
    if (isNativeUnity()) prefetchBeatLines(BEAT_LINES.map(n => t(`journey.beat.${n}` as 'journey.beat.1')), tone, lang);
    // With the 3D cabin the journey opens on the station platform (JourneyPlatform in Unity).
    void board(journey.id, counselorId, tone, lang, { platform: isNativeUnity() });
    navigation.replace('Journey');
  };

  return (
    <View style={styles.root}>
      <View style={styles.sky}>
        <JourneyTrainArt fadeTo={colors.bg} />
      </View>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => { sfx.back(); navigation.goBack(); }} accessibilityRole="button">
            <Icon name="back" size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
          <Text style={styles.title}>{t('journey.choose.title', { year: journey.year })}</Text>
          <Text style={styles.sub}>{t('journey.choose.sub')}</Text>
          {journey.counselors.map(jc => {
            const c = getLocalizedCounselor(jc.id, lang);
            if (!c) return null;
            return (
              <Pressable
                key={jc.id}
                onPress={() => pick(jc.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                {c.avatarImage ? (
                  <Image source={c.avatarImage} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: c.accent }]} />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.pitch}>{t(jc.pitch)}</Text>
                </View>
                <Icon name="play" size={18} color={colors.gold} />
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, height: 320 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  scroll: { padding: spacing.xl, paddingTop: 150, gap: spacing.md },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: { ...typography.hero, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  pressed: { backgroundColor: colors.cardPressed },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  cardBody: { flex: 1, gap: 4 },
  name: { ...typography.h3, color: colors.textPrimary },
  pitch: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
});
