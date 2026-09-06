import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useCounselingStore } from '../store/counselingStore';
import { isNativeUnity, unityApiBase, unityBridge } from '../bridge';
import { getDeviceId } from '../../../shared/device/deviceId';
import { UnityToRNEvent } from '../types';
import { fetchTicketBalance } from '../api/tickets';

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
  const topic = useCounselingStore(s => s.topic);
  const handled = useRef(false);

  // null = still asking, false = go ahead, true = stop here and say why.
  //
  // The engine refuses a ticketless session anyway, but it refuses INSIDE: the room loads, the
  // counselor appears, and the session dies in front of the player. Asking here turns that into a
  // precondition stated on the way in.
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchTicketBalance(ac.signal).then(balance => {
      // An unknown balance is NOT zero — see fetchTicketBalance. Locking the player out because the
      // server hiccuped would be a worse bug than the one this check exists to fix.
      setBlocked(balance != null && balance.tickets <= 0);
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!counselor || !subject) return;
    if (blocked !== false) return;   // do not boot Unity until the balance says it is worth booting
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

    // Mock boots here and signals UNITY_READY. The real engine only boots when
    // the room mounts its UnityHost, so we hand over immediately and let the
    // room show its own loading overlay until Unity is ready.
    const unsub = unityBridge.onEvent((e: UnityToRNEvent) => {
      if (e.type === 'UNITY_READY') goToRoom();
    });
    if (isNativeUnity) setTimeout(goToRoom, 400);

    unityBridge.openCounselingRoom({
      sessionId,
      counselor: {
        id: counselor.id,
        characterId: counselor.characterId,
        roomId: counselor.roomId,
        name: counselor.name,
      },
      subject: {
        id: subject.id,
        displayName: subject.displayName,
        birthDate: subject.birthDate,
        birthTime: subject.birthTime,
        gender: subject.gender,
      },
      topic,
      apiBase: unityApiBase,
      locale: lang,
      auth: getDeviceId(),
    });

    return unsub;
  }, [counselor, subject, topic, navigation, params.resuming, lang, blocked]);

  // Said on the way in, not after the room has loaded and given up.
  if (blocked) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('unity.noTickets.title')}</Text>
        <Text style={styles.subtitle}>{t('unity.noTickets.body')}</Text>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
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
          style={styles.portrait}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.orb, { backgroundColor: counselor?.accent ?? colors.violet }]} />
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
  spinner: { marginBottom: spacing.lg },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xxl },
  back: { marginTop: spacing.xxl, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: 999, backgroundColor: colors.card },
  backText: { ...typography.body, color: colors.textPrimary },
});
