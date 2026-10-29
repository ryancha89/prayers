import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { roomSubjects } from '../bridge/subjectPayload';
import { playerCharacter, playerHair, playerOutfit } from '../bridge/playerGender';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useCounselingStore } from '../store/counselingStore';
import { defaultTopicFor } from '../topicsForCounselor';
import { getUnityBridge, isNativeUnity, unityApiBase } from '../bridge';
import { isPixelCounselor } from '../pixel/pixelCounselors';
import { getUserAuth } from '../../auth/store/authStore';
import { CounselingTopic, UnityToRNEvent } from '../types';
import { fetchCoins } from '../../coins/api/coinsApi';
import { useCoins } from '../../coins/store/coinStore';
import { useScreen } from '../../../shared/device/screen';
import { beginSceneTransition } from '../../../shared/transition/sceneTransition';
import { ROOM_BLOCK_LINE, roomBlock } from '../roomAvailability';
import { sfx } from '../../../shared/audio/sfx';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'UnityEntry'>;

/**
 * Loading transition into the (mock) Unity room (spec §17). Boots the bridge,
 * waits for UNITY_READY, then replaces itself with the room so Back returns to
 * the previous screen rather than the loader.
 */
export const UnityEntryScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const lang = useLang();
  const counselor = getLocalizedCounselor(params.counselorId, lang);
  const getSubject = useSubjectsStore(s => s.getById);
  const subject = getSubject(params.subjectId);
  // A room that cannot be opened from this phone — the thread's saved person is not on it, or the
  // counsellor has no room — says so with a way back (29-10). It used to return quietly under the
  // loading veil: an endless spinner.
  const blocked = roomBlock(counselor, subject);
  // The shared loading screen into the room: the shared picture and the counselor's name, until the room's
  // UNITY_READY (sceneTransition.ts). Every way into a room comes through here. Not for a room that will
  // not open, nor for a pixel counsellor (Nabi): his room is drawn by the app and never sends
  // UNITY_READY, so the veil held the player for the whole MAX_MS (29-10).
  useEffect(() => {
    if (blocked || isPixelCounselor(counselor?.characterId)) return;
    beginSceneTransition('counsel', { name: counselor?.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const storedTopic = useCounselingStore(s => s.topic);
  // Every way into the room comes through here, so the fallback belongs here and not in the
  // callers. Resuming an old conversation never set a topic at all — it leaned on whatever the
  // persisted store happened to hold — and since the picker was removed (18-09) the store is only
  // written on the way in through the subject screen. An empty topic is not cosmetic: the lines
  // that name the subject are recorded per topic with no unsuffixed file, so it drops them into
  // live synthesis.
  const topic = storedTopic ?? (defaultTopicFor(counselor?.characterId) as CounselingTopic);
  const handled = useRef(false);
  // Held sideways the portrait, spinner and two lines are most of a 375pt-tall SE: a smaller face
  // keeps the copy clear of the edges. No UnityView here — the room screen hosts it — so nothing to
  // tell Unity either.
  const landscape = useScreen().landscape;

  // The wallet is loaded on the way in, but it no longer bars the door (16-10, user: "질문전까지
  // 이화면보이지마 질문할때 없으면 유도해야해"). Walking in and looking round costs nothing; the room
  // asks for coins when a question would spend them (CounselingRoomScreen, NoCoinsCard).
  useEffect(() => {
    const ac = new AbortController();
    fetchCoins(ac.signal).then(r => {
      if (r) useCoins.getState().setWallet(r.balance, r.products);
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!counselor || !subject || blocked) return;
    const sessionId = `session_${counselor.id}_${subject.id}`;

    const goToRoom = () => {
      if (handled.current) return;
      handled.current = true;
      navigation.replace('CounselingRoom', {
        sessionId,
        counselorId: counselor.id,
        subjectId: subject.id,
        resuming: params.resuming,
      });
    };

    // A pixel counselor's room is drawn by the app — there is no player to boot.
    if (isPixelCounselor(counselor.characterId)) {
      goToRoom();
      return;
    }

    // Mock boots here and signals UNITY_READY. The real engine only boots when
    // the room mounts its UnityHost, so we hand over immediately and let the
    // room show its own loading overlay until Unity is ready.
    const unsub = getUnityBridge().onEvent((e: UnityToRNEvent) => {
      if (e.type === 'UNITY_READY') goToRoom();
    });
    if (isNativeUnity()) setTimeout(goToRoom, 400);

    getUnityBridge().openCounselingRoom({
      sessionId,
      counselor: {
        id: counselor.id,
        characterId: counselor.characterId,
        roomId: counselor.roomId,
        name: counselor.name,
      },
      ...roomSubjects(subject, useSubjectsStore.getState().self),
      topic,
      apiBase: unityApiBase,
      locale: lang,
      // The ACCOUNT, not the device. Unity forwards this as the User-Auth header, so the reading
      // the room fetches belongs to whoever is signed in — and follows them to their next phone.
      auth: getUserAuth() ?? '',
      playerGender: useSubjectsStore.getState().self.gender,
      playerCharacter: playerCharacter(),
      playerHair: playerHair(),
      playerOutfit: playerOutfit(),
    });

    return unsub;
  }, [counselor, subject, blocked, topic, navigation, params.resuming, lang]);

  if (blocked) {
    const back = () => {
      sfx.back();
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Tabs', { screen: 'Home' });
    };
    return (
      <View style={styles.container} testID="unity-entry-blocked">
        <View style={[styles.orb, landscape && styles.orbSide, { backgroundColor: counselor?.accent ?? colors.violet }]} />
        <Text style={styles.title}>{t('unity.cantOpen')}</Text>
        <Text style={styles.subtitle}>{t(ROOM_BLOCK_LINE[blocked])}</Text>
        <Pressable
          testID="unity-entry-back"
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t('unity.noTickets.back')}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>{t('unity.noTickets.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {counselor?.avatarImage ?? counselor?.cardImage ? (
        <Image
          source={(counselor?.avatarImage ?? counselor?.cardImage)!}
          style={[styles.portrait, landscape && styles.portraitSide]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.orb, landscape && styles.orbSide, { backgroundColor: counselor?.accent ?? colors.violet }]} />
      )}
      <ActivityIndicator color={colors.violetSoft} style={styles.spinner} />
      <Text style={styles.title}>{t('unity.preparing')}</Text>
      <Text style={styles.subtitle}>
        {counselor ? t('unity.waiting', { name: counselor.name }) : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  orb: { width: 120, height: 120, borderRadius: 60, opacity: 0.6, marginBottom: spacing.xxl },
  portrait: { width: 160, height: 160, borderRadius: 80, marginBottom: spacing.xxl },
  portraitSide: { width: 112, height: 112, borderRadius: 56, marginBottom: spacing.lg },
  orbSide: { width: 96, height: 96, borderRadius: 48, marginBottom: spacing.lg },
  spinner: { marginBottom: spacing.lg },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xxl },
  back: {
    marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.violetSoft,
  },
  backText: { ...typography.bodyStrong, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
});
