import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useCounselingStore } from '../store/counselingStore';
import { counselorAI } from '../api/counselorAI';
import { isNativeUnity, unityBridge } from '../bridge';
import { CounselorResponse, CounselorEmotion, UnityToRNEvent } from '../types';
import { CounselorStage, RoomState } from '../components/CounselorStage';
import { UnityHost } from '../components/UnityHost';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'CounselingRoom'>;

const audioDurationMs = (text: string) => Math.min(6000, 900 + text.length * 42);

/** Rotating one-liners under the loading spinner — the Unity boot is 5-8s of
 *  otherwise dead air. */
const LoadingTips: React.FC = () => {
  const t = useT();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIdx(i => (i + 1) % 3), 2600);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={styles.loadingTip}>{t(`unity.tip${idx + 1}` as never)}</Text>
  );
};

let msgSeq = 0;
const msgId = () => `m_${Date.now().toString(36)}_${msgSeq++}`;

/** The 3D counseling room (mock Unity stage) + minimal in-session UI (spec §18, §27). */
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
  const priorSummary = useConversationsStore(
    s => s.byId[params.sessionId]?.lastTopicSummary,
  );

  const [state, setState] = useState<RoomState>('greeting');
  const [emotion, setEmotion] = useState<CounselorEmotion>('happy');
  const [closeUp, setCloseUp] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [input, setInput] = useState('');
  // With the embedded player, the room shows a loading veil until UNITY_READY.
  const [unityReady, setUnityReady] = useState(!isNativeUnity);
  // Unity reports when the consultation accepts a typed question (INPUT_STATE).
  const [inputEnabled, setInputEnabled] = useState(!isNativeUnity);
  const turn = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  const after = (ms: number, fn: () => void) => {
    const timer = setTimeout(fn, ms);
    timers.current.push(timer);
  };

  const playResponse = useCallback(
    (resp: CounselorResponse) => {
      setEmotion(resp.emotion);
      setCloseUp(resp.camera === 'closeUp');
      setState('speaking');
      setSubtitle(resp.text);
      // Drive the 3D character: text + emotion + animation + camera (spec §25).
      // The bridge queues this until UNITY_READY, so it is safe pre-boot.
      unityBridge.sendEvent({ type: 'COUNSELOR_RESPONSE', payload: resp });
      appendMessage(params.sessionId, {
        id: resp.id,
        role: 'counselor',
        text: resp.text,
        at: new Date().toISOString(),
      });
      // Wait for "audio" playback to finish, then return to idle (spec §44).
      after(audioDurationMs(resp.text), () => {
        setState('idle');
        setCloseUp(false);
      });
    },
    [appendMessage, params.sessionId],
  );

  // Enter the room: create/resume the session, then greet (spec §31, §50-13/14).
  // With the embedded player, the Unity consultation scene owns the entire
  // dialogue (greeting, question UI, AI) — RN only hosts and tracks the session.
  useEffect(() => {
    if (!counselor || !subject || started.current) return;
    started.current = true;

    ensureSession({
      sessionId: params.sessionId,
      counselorId: counselor.id,
      counselorName: counselor.name,
      counselorAccent: counselor.accent,
      subjectId: subject.id,
    });

    if (!isNativeUnity) {
      setState('greeting');
      counselorAI
        .greeting({
          counselorName: counselor.name,
          subject,
          topic,
          resuming: params.resuming,
          lastTopicSummary: priorSummary,
          lang,
        })
        .then(playResponse);
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [counselor, subject, topic, params, ensureSession, playResponse, priorSummary, lang]);

  const sendUserText = useCallback(
    (text: string) => {
      if (!text || !counselor || !subject) return;

      appendMessage(params.sessionId, {
        id: msgId(),
        role: 'user',
        text,
        at: new Date().toISOString(),
      });
      if (turn.current === 0) setLastTopicSummary(params.sessionId, text);

      if (isNativeUnity) {
        // Unity's consultation flow answers; RN just carries the question over.
        unityBridge.sendEvent({ type: 'USER_QUESTION', payload: { text } });
        return;
      }

      setState('thinking');
      setEmotion('thinking');
      counselorAI
        .reply({ counselorName: counselor.name, subject, topic, userText: text, turn: turn.current++, lang })
        .then(playResponse);
    },
    [counselor, subject, topic, lang, appendMessage, setLastTopicSummary, params.sessionId, playResponse],
  );

  const onSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendUserText(text);
  };

  const onExit = async () => {
    timers.current.forEach(clearTimeout);
    await unityBridge.closeCounselingRoom();
    // Land on the Conversations tab so the session is visible (spec §50-23).
    navigation.navigate('Tabs', { screen: 'Conversations' });
  };

  // Leaving the room by ANY route — back button, error, navigation reset —
  // must end the Unity session (and its BGM). Unmount-only cleanup; the
  // explicit back-button path calls the same idempotent close.
  useEffect(() => {
    return () => {
      unityBridge.closeCounselingRoom();
    };
  }, []);

  // Unity → RN events: ready handshake, in-Unity input, in-Unity exit (spec §41).
  useEffect(() => {
    return unityBridge.onEvent((e: UnityToRNEvent) => {
      if (e.type === 'UNITY_READY') setUnityReady(true);
      else if (e.type === 'USER_MESSAGE') sendUserText(e.payload.text.trim());
      else if (e.type === 'COUNSELOR_MESSAGE')
        // Unity owns the on-screen dialogue; this mirror is what makes the
        // Conversations tab hold the counselor's half of the session too.
        appendMessage(params.sessionId, {
          id: msgId(),
          role: 'counselor',
          text: e.payload.text,
          at: new Date().toISOString(),
        });
      else if (e.type === 'INPUT_STATE') setInputEnabled(e.payload.enabled);
      else if (e.type === 'EXIT_SESSION') onExit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendUserText]);

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
          state={state}
          emotion={emotion}
          closeUp={closeUp}
        />
      )}
      {!unityReady && (
        <View style={styles.loadingVeil}>
          <ActivityIndicator color={colors.violetSoft} />
          <Text style={styles.loadingText}>{t('unity.preparing')}</Text>
          {/* The engine boot takes 5-8s — a rotating line gives that wait a voice
              instead of leaving the player staring at a bare spinner. */}
          <LoadingTips />
        </View>
      )}

      {/* Top controls — kept minimal, never covering the character (spec §27) */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.roundBtn} hitSlop={8} onPress={onExit}>
          <Icon name="back" size={26} />
        </Pressable>
        <Pressable style={styles.roundBtn} hitSlop={8}>
          <Icon name="speaker" size={18} />
        </Pressable>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}
        pointerEvents="box-none">
        {!isNativeUnity && !!subtitle && (
          <View style={styles.subtitleWrap}>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        )}
        {/* Messenger-style chat bar: RN owns typing (native keyboard + IME);
            with Unity embedded the question travels over the bridge. */}
        <View style={styles.inputBar}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                editable={inputEnabled}
                onChangeText={value => {
                  setInput(value);
                  if (state === 'idle' && value.length > 0) setState('listening');
                }}
                placeholder={inputEnabled ? t('room.placeholder') : t('room.waitInput')}
                placeholderTextColor={colors.textMuted}
                multiline
                onSubmitEditing={onSend}
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  (!input.trim() || !inputEnabled) && styles.sendDisabled,
                ]}
                onPress={onSend}
                disabled={!input.trim() || !inputEnabled}>
                <Icon name="send" size={22} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.textSecondary, padding: spacing.xl },
  loadingVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textSecondary },
  loadingTip: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
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
    backgroundColor: 'rgba(10,10,15,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  inputBar: {
    backgroundColor: 'rgba(12,13,20,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingBottom: spacing.sm,
  },
  subtitleWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(10,10,15,0.72)',
  },
  subtitle: { ...typography.body, color: colors.textPrimary, lineHeight: 24 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.card },
});
