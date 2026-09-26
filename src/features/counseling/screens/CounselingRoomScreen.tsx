import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
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
import { fetchRecall } from '../api/prayersServer';
import { devlog } from '../../../shared/devlog';
import { WalkControls } from '../components/WalkControls';
import { CueTester } from '../components/CueTester';
import { useCounselingStore } from '../store/counselingStore';
import { useChatModeStore } from '../store/chatModeStore';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { counselorAI, toneForCharacter } from '../api/counselorAI';
import { getUnityBridge, isNativeUnity } from '../bridge';
import { CounselorStage } from '../components/CounselorStage';
import { UnityHost } from '../components/UnityHost';
import { ConsultationOverlay } from '../components/ConsultationOverlay';
import { useConsultationEngine } from '../hooks/useConsultationEngine';
import { voiceFor } from '../flow/voice';
import { PixelCatStage } from '../pixel/PixelCatStage';
import { isPixelCounselor } from '../pixel/pixelCounselors';
import type { CatCue, CatGesture } from '../pixel/cues';

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

/** How long the room may spend between SESSION_INIT and UNITY_READY before the screen gives up.
 *  See the deadline effect below for why it is this generous. */
const UNITY_HANDSHAKE_TIMEOUT_MS = 30_000;

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

  const chatMode = useChatModeStore(s => s.chatMode);
  const setChatMode = useChatModeStore(s => s.setChatMode);
  const addDiscoveries = useArchiveStore(s => s.addDiscoveries);

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
    await getUnityBridge().closeCounselingRoom();
    // Land on the Conversations tab so the session is visible (spec §50-23).
    navigation.navigate('Tabs', { screen: 'Conversations' });
  }, [navigation]);

  // Her register, from what the roster says she reads — not from her name, and not from the topic
  // the player picked: a career counselor asked about love still talks like a career counselor.
  const voice = voiceFor(counselor?.characterId);

  // A pixel counselor is drawn here, not staged in Unity — see pixel/pixelCounselors.ts.
  const pixel = isPixelCounselor(counselor?.characterId);
  const [catThinking, setCatThinking] = useState(false);
  const [catGesture, setCatGesture] = useState<{ name: CatGesture; seq: number } | null>(null);
  const onCue = useCallback((cue: CatCue) => {
    if (cue.type === 'thinking') setCatThinking(cue.on);
    else setCatGesture(g => ({ name: cue.gesture, seq: (g?.seq ?? 0) + 1 }));
  }, []);

  const consultation = useConsultationEngine({
    topic,
    voice,
    pixel,
    onCue,
    // He is a talker, not a stage show: no scripted reading, and each answer as long as its
    // question deserves — a line for a thank-you, paragraphs for "explain it properly".
    chatFirst: pixel,
    fixedChatMode: pixel ? 'auto' : undefined,
    onCounselorLine: text => record('counselor', text),
    // What she noticed about the player, parked for their verdict in the 아카이브 tab — never
    // written as a memory from here.
    onDiscoveries: found => addDiscoveries(found, params.sessionId),
    onUserLine: text => {
      record('user', text);
      // The first question is what the Conversations row is titled by.
      if (turn.current === 0) setLastTopicSummary(params.sessionId, text);
      turn.current += 1;
    },
    onFinished: onExit,
    mockReply: async (question, _loop, mode) => {
      const resp =
        // A chat-first room has no scripted question phase for the local greeting to answer — its
        // very first turn is already a real question.
        turn.current <= 1 && !pixel
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
              // These two are what turn this from a scripted reply into the real reading: the
              // session id is the thread the server remembers, and the tone is the voice it
              // answers in. Without either it falls back to the mock, silently by design.
              sessionId: params.sessionId,
              tone: toneForCharacter(counselor?.characterId),
              chatMode: mode,
            });
      // The scenes go with the words. Dropping them here is what kept the server's break-up from
      // ever reaching a bubble — the greeting has none, and that is correct: it is the room's own
      // copy, not a reading.
      return { text: resp.text, scenes: resp.scenes, discoveries: resp.discoveries };
    },
  });

  // What she remembers of last time, fetched while the player is still loading the room.
  //
  // Deliberately not awaited by anything: the walk starts on UNITY_READY and the welcome is four
  // seconds behind it, which this beats comfortably — and if it does not, or the server has nothing
  // to remember, the authored welcome plays and nobody is any the wiser. Free on the server (no
  // model call), so it costs the player nothing to ask on every visit.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRecall({
      uniqId: params.sessionId,
      lang,
      topic,
      // Her own conversations, not the player's most recent one with anybody.
      counselorId: params.counselorId,
      // How the 3D room's threads are found — they carry her persona, never the card id.
      tone: toneForCharacter(counselor?.characterId),
      signal: ctrl.signal,
    })
      .then(recall => {
        if (!recall) return;
        devlog(`[recall] ${recall.turns} turn(s) remembered — opening with them`);
        consultation.remember(recall.opening);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // Once per room. A language change mid-session must not re-ask and re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      getUnityBridge().closeCounselingRoom();
    };
  }, []);

  // The player can also leave from inside the player (a scripted exit, a
  // refused ticket). Both come back as EXIT_SESSION.
  // SESSION_ERROR is the OTHER terminal message, and handling it is not cosmetic.
  //
  // The room sends it when it cannot continue: no seatable counselor
  // (`auto_seat_failed:<persona>`), no chart for the person asked about
  // (`subject_unavailable:inline`), or no tickets. Unhandled, nothing ever sets
  // `consultation.ready`, so the loading veil below never lifts — the player sits
  // watching a spinner over a room that already gave up, with nothing on screen
  // saying so and no way out but the back gesture.
  //
  // Observed doing exactly that: `subject_unavailable:inline` arrived 1.7s after
  // SESSION_INIT and the screen stayed on the veil indefinitely.
  //
  // The reason is logged rather than shown. It is diagnostic text — "auto_seat_failed:water"
  // means nothing to a player — and the honest fix for each cause is to stop it happening,
  // not to print it.
  useEffect(() => {
    return getUnityBridge().onEvent(e => {
      if (e.type === 'EXIT_SESSION') onExit();
      else if (e.type === 'SESSION_ERROR') {
        console.warn(`[room] session error: ${e.payload?.reason ?? 'unknown'}`);
        onExit();
      }
    });
  }, [onExit]);

  // …and the room can also say NOTHING at all, which the block above does not cover.
  //
  // Measured on the simulator: after a JS reload, SESSION_INIT went out and no BRIDGE_READY or
  // UNITY_READY ever came back — the player is already loaded, so the native view has nothing to
  // boot and nobody answers. No SESSION_ERROR is sent for that, because from the room's side
  // nothing failed. The veil then stays up forever over a black screen, with the back gesture as
  // the only way out, and the app looks hung rather than broken.
  //
  // So the handshake gets a deadline. It is deliberately long — the boot is 5-8s and a cold start
  // on a slow device is slower still, and cutting a session that was about to open is worse than a
  // few extra seconds of spinner. Measured for comparison: SESSION_INIT → UNITY_READY took 1.3s
  // when it worked at all.
  //
  // Leaving is the same answer SESSION_ERROR gets, on purpose: the player lands back on
  // Conversations where their session is waiting, instead of guessing at a spinner.
  useEffect(() => {
    if (pixel || !isNativeUnity() || consultation.ready) return;
    const timer = setTimeout(() => {
      console.warn('[room] the player never answered SESSION_INIT — leaving instead of hanging.');
      onExit();
    }, UNITY_HANDSHAKE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pixel, consultation.ready, onExit]);

  if (!counselor || !subject) {
    return (
      <View style={styles.container}>
        <Text style={styles.missing}>{t('room.unavailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {pixel ? (
        <PixelCatStage
          speaking={consultation.state.speaking}
          utterance={lastCounselorWords(consultation.state)}
          thinking={catThinking || consultation.state.pending}
          listening={consultation.state.inputEnabled && !consultation.state.speaking}
          emotion={consultation.state.emotion}
          gesture={catGesture}
        />
      ) : isNativeUnity() ? (
        <UnityHost style={StyleSheet.absoluteFill} />
      ) : (
        <CounselorStage
          name={counselor.name}
          accent={counselor.accent}
          // `speaking` first, because the two came apart: in the free-chat loop the box is open
          // WHILE she talks, so that the player can cut in. `!inputEnabled` still covers the staged
          // phases, where a shut box does mean she has the floor.
          state={
            consultation.state.speaking || !consultation.state.inputEnabled ? 'speaking' : 'idle'
          }
          // The server's own direction for the line being spoken, when it sent one. `neutral` is
          // still what an undirected line gets — it is a real answer here, not a placeholder.
          emotion={consultation.state.emotion}
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

      {/* While the player is on their feet the reading has not started, so the overlay below has
          nothing to say and these are the only controls on screen. They unmount themselves the
          moment the room reports the player seated — see useConsultationEngine.walking. */}
      <WalkControls visible={consultation.walking} />
      <ConsultationOverlay
        voice={voice}
        counselorName={counselor.name}
        state={consultation.state}
        onTap={consultation.tap}
        onChoose={consultation.choose}
        onSubmit={consultation.submit}
        onRetry={consultation.retry}
        onLeave={onExit}
        onMicStart={consultation.startMic}
        onMicStop={consultation.stopMic}
        onMicCancel={consultation.cancelMic}
        onHush={consultation.hush}
        micAvailable={consultation.micAvailable}
        chatMode={pixel ? 'auto' : chatMode}
        onChatMode={pixel ? undefined : setChatMode}
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

      {/* Dev only, and mounted LAST on purpose: it has to sit above ConsultationOverlay, whose
          bubble and input bar cover exactly the part of the screen a bottom sheet wants. Mounted
          before it, the lower half of the cue list could be read and not tapped. */}
      {SHOW_CUE_TESTER && <CueTester />}
    </View>
  );
};

/** What the counselor is saying right now: the phase card's line, or — in the free chat, where the
 *  card is empty — the newest counselor entry in the transcript, which grows as the answer does. */
function lastCounselorWords(s: { line: string; transcript: { role: string; text: string }[] }): string {
  if (s.line) return s.line;
  for (let i = s.transcript.length - 1; i >= 0; i -= 1) {
    if (s.transcript[i].role === 'counselor') return s.transcript[i].text;
  }
  return '';
}

/**
 * The "CUE" tab (CueTester): fire any animation cue at the counselor by hand.
 *
 * OFF, even in dev builds. `__DEV__` alone put a purple tab on the edge of every room in every
 * build the team plays, over the scene being judged (asked to hide it, 23-09). Release builds never
 * showed it. Flip to `__DEV__` while tuning a counselor's cues.
 */
const SHOW_CUE_TESTER = false;

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
