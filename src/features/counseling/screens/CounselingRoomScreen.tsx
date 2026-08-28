import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { absoluteFill, colors, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useCounselingStore } from '../store/counselingStore';
import { counselorAI } from '../api/counselorAI';
import { isNativeUnity, unityBridge } from '../bridge';
import { CounselorStage } from '../components/CounselorStage';
import { UnityHost } from '../components/UnityHost';
import { ConsultationOverlay } from '../components/ConsultationOverlay';
import { useConsultationEngine } from '../hooks/useConsultationEngine';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'CounselingRoom'>;

/** Rotating one-liners under the loading spinner — the Unity boot is 5-8s of
 *  otherwise dead air. */
const LoadingTips: React.FC = () => {
  const t = useT();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIdx(i => (i + 1) % 3), 2600);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.loadingTip}>{t(`unity.tip${idx + 1}` as never)}</Text>;
};

let msgSeq = 0;
const msgId = () => `m_${Date.now().toString(36)}_${msgSeq++}`;

/**
 * The consultation room.
 *
 * Unity renders the room, the counselor and the chart visualisations; React
 * renders everything the player reads or taps, and `ConsultationEngine` decides
 * what that is. The engine used to live in the player (`ConsultationFlowController`
 * driving `ConsultationFlowUI` on a canvas), which put the app's typography,
 * keyboard, safe areas and back gesture on the far side of a texture.
 *
 * A build with no embedded player runs the same engine against a mock stage, so
 * the flow is walkable in a simulator.
 */
export const CounselingRoomScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const lang = useLang();
  const counselor = getLocalizedCounselor(params.counselorId, lang);
  const subject = useSubjectsStore(s => s.getById(params.subjectId));
  const topic = useCounselingStore(s => s.topic);

  const ensureSession = useConversationsStore(s => s.ensureSession);
  const appendMessage = useConversationsStore(s => s.appendMessage);
  const setLastTopicSummary = useConversationsStore(s => s.setLastTopicSummary);

  const turn = useRef(0);
  const exited = useRef(false);

  const record = useCallback(
    (role: 'user' | 'counselor', text: string) => {
      if (!text) return;
      appendMessage(params.sessionId, {
        id: msgId(),
        role,
        text,
        at: new Date().toISOString(),
      });
    },
    [appendMessage, params.sessionId],
  );

  const onExit = useCallback(async () => {
    if (exited.current) return;
    exited.current = true;
    await unityBridge.closeCounselingRoom();
    // Land on the Conversations tab so the session is visible (spec §50-23).
    navigation.navigate('Tabs', { screen: 'Conversations' });
  }, [navigation]);

  const consultation = useConsultationEngine({
    topic,
    onCounselorLine: text => record('counselor', text),
    onUserLine: text => {
      record('user', text);
      // The first question is what the Conversations row is titled by.
      if (turn.current === 0) setLastTopicSummary(params.sessionId, text);
      turn.current += 1;
    },
    onFinished: onExit,
    mockReply: async question => {
      const resp =
        turn.current <= 1
          ? await counselorAI.greeting({
              counselorName: counselor?.name ?? '',
              subject: subject!,
              topic,
              resuming: params.resuming,
              lang,
            })
          : await counselorAI.reply({
              counselorName: counselor?.name ?? '',
              subject: subject!,
              topic,
              userText: question,
              turn: turn.current,
              lang,
            });
      return resp.text;
    },
  });

  // Create/resume the conversation row before the first line is recorded.
  useEffect(() => {
    if (!counselor || !subject) return;
    ensureSession({
      sessionId: params.sessionId,
      counselorId: counselor.id,
      counselorName: counselor.name,
      counselorAccent: counselor.accent,
      subjectId: subject.id,
    });
  }, [counselor, subject, ensureSession, params.sessionId]);

  // Leaving the room by ANY route — back button, error, navigation reset — must
  // end the Unity session (and its BGM). Unmount-only cleanup; the explicit
  // back-button path calls the same idempotent close.
  useEffect(() => {
    return () => {
      unityBridge.closeCounselingRoom();
    };
  }, []);

  // The player can also leave from inside the player (a scripted exit, a
  // refused ticket). Both come back as EXIT_SESSION.
  useEffect(() => {
    return unityBridge.onEvent(e => {
      if (e.type === 'EXIT_SESSION') onExit();
    });
  }, [onExit]);

  if (!counselor || !subject) {
    return (
      <View style={styles.container}>
        <Text style={styles.missing}>{t('room.unavailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isNativeUnity ? (
        <UnityHost style={StyleSheet.absoluteFill} />
      ) : (
        <CounselorStage
          name={counselor.name}
          accent={counselor.accent}
          state={consultation.state.inputEnabled ? 'idle' : 'speaking'}
          emotion="neutral"
          closeUp={consultation.state.phaseId === 'P13'}
        />
      )}

      {!consultation.ready && (
        <View style={styles.loadingVeil}>
          <ActivityIndicator color={colors.violetSoft} />
          <Text style={styles.loadingText}>{t('unity.preparing')}</Text>
          <LoadingTips />
        </View>
      )}

      <ConsultationOverlay
        state={consultation.state}
        onTap={consultation.tap}
        onChoose={consultation.choose}
        onSubmit={consultation.submit}
        onRetry={consultation.retry}
        onLeave={onExit}
      />

      {/* Top controls — kept minimal, never covering the character (spec §27) */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.roundBtn} hitSlop={8} onPress={onExit}>
          <Icon name="back" size={26} />
        </Pressable>
        <Pressable style={styles.roundBtn} hitSlop={8}>
          <Icon name="speaker" size={18} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: { ...typography.body, color: colors.textSecondary, margin: spacing.xl },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  loadingVeil: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
    gap: spacing.sm,
  },
  loadingText: { ...typography.body, color: colors.textSecondary },
  loadingTip: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
