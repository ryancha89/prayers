/**
 * Everything the player reads or taps during a consultation.
 *
 * This is the canvas that used to live inside Unity. `ConsultationFlowUI` drew a
 * dialogue card, a choice list, a question box, a report and a chat transcript
 * on a world-space canvas in the embedded player — which meant the app's fonts,
 * its keyboard and IME, its safe areas and its back gesture all stopped at the
 * edge of a texture. All of it is React now, sitting above the Unity view.
 *
 * It is presentational: every decision (which surface, what text, when the beat
 * ends) belongs to `ConsultationEngine`. This file only knows how it looks.
 */
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { useLang } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { ui } from '../flow/strings';
import { CounselorVoice, voiced } from '../flow/voice';
import type { FlowState } from '../flow/engine';
import type { PhaseChoice } from '../flow/types';

export interface ConsultationOverlayProps {
  state: FlowState;
  onTap(): void;
  onChoose(choice: PhaseChoice): void;
  onSubmit(text: string): void;
  onRetry(): void;
  onLeave(): void;
  /** Press the mic. Cuts the counselor off and starts recording. */
  onMicStart?(): void;
  /** Finished speaking — transcribe what was said. */
  onMicStop?(): void;
  /** Drop the take; the counselor picks her answer back up. */
  onMicCancel?(): void;
  /** Stop her talking, with no question behind it. */
  onHush?(): void;
  /** False in builds with no embedded player — the button is hidden rather than offered and then
   *  failing, because there is no microphone on this side of the bridge. */
  micAvailable?: boolean;
  /** The counselor's register for the two input placeholders. Everything else on this overlay is
   *  the APP talking (mic errors, "tap to continue"), and the app has one voice whoever is in the
   *  chair — only the prompts she is asking through follow her. */
  voice?: CounselorVoice;
}

export const ConsultationOverlay: React.FC<ConsultationOverlayProps> = ({
  state,
  onTap,
  onChoose,
  onSubmit,
  onRetry,
  onLeave,
  voice = 'default',
  onMicStart,
  onMicStop,
  onMicCancel,
  onHush,
  micAvailable = false,
}) => {
  const lang = useLang();
  /** A prompt SHE is asking through, in her register. Falls back to the shared copy. */
  const say = (key: Parameters<typeof ui>[0]) => voiced(voice, key, lang) ?? ui(key, lang);
  const [input, setInput] = useState('');
  const mic = state.mic;
  const recording = mic.state !== 'idle';

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sfx.send();
    onSubmit(text);
  };

  // `none` is the doc's "minimal UI; prioritize environmental immersion" — the
  // entrance beat and the closing pull-back are meant to be watched, not read.
  if (state.screen === 'none' && !state.line) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
      pointerEvents="box-none">
      {/* Tap-to-continue catches the whole screen, not just the card: a dialogue
          beat is advanced by tapping anywhere, the way it was in the engine. */}
      {state.canTap && (
        <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessibilityRole="button" />
      )}

      <View style={styles.stack} pointerEvents="box-none">
        {state.screen === 'loop' && <Transcript state={state} />}

        {state.screen === 'report' && state.report && <Report state={state} />}

        {!!state.line && state.screen !== 'loop' && (
          <View style={styles.card}>
            {!!state.speaker && <Text style={styles.speaker}>{state.speaker}</Text>}
            <ScrollView style={styles.lineScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.line}>{state.line}</Text>
            </ScrollView>
            {state.screen === 'thinking' && <ThinkingDots />}
            {state.canTap && <Text style={styles.hint}>{ui('tap.continue', lang)}</Text>}
          </View>
        )}

        {state.screen === 'notice' && state.notice && (
          <View style={styles.card}>
            <Text style={styles.line}>{state.notice.body}</Text>
            <View style={styles.noticeRow}>
              <Pressable style={[styles.pill, styles.pillPrimary]} onPress={onRetry}>
                <Text style={styles.pillTextPrimary}>{state.notice.retryLabel}</Text>
              </Pressable>
              <Pressable style={styles.pill} onPress={onLeave}>
                <Text style={styles.pillText}>{state.notice.leaveLabel}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {state.screen === 'choices' && (
          <View style={styles.choices}>
            {state.choices.map(c => (
              <Pressable
                key={c.choice.locKey || c.label}
                style={styles.choice}
                onPress={() => onChoose(c.choice)}>
                <Text style={styles.choiceText}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* The server's own follow-up question, offered rather than imposed. */}
        {state.screen === 'loop' && !!state.suggestion && (
          <Pressable style={styles.suggestion} onPress={() => onSubmit(state.suggestion)}>
            <Text style={styles.suggestionText} numberOfLines={2}>
              {state.suggestion}
            </Text>
          </Pressable>
        )}

        {(state.screen === 'questionBox' || state.screen === 'loop') && (
          <SafeAreaView edges={['bottom']}>
            {/* Why the take failed, in the player's own language. Unity sends a key, never a
                sentence — the copy for every one of these is here. */}
            {!!mic.error && <Text style={styles.micError}>{micErrorText(mic.error, lang)}</Text>}

            {/* She is talking and the box is open: cutting in is allowed, so it is also SHOWN.
                Without this the only way to learn it is to try, and a player who does not know
                they may interrupt will sit through every answer to the end. */}
            {state.speaking && state.screen === 'loop' && !recording && (
              <Pressable style={styles.hush} onPress={onHush} hitSlop={8}>
                <Icon name="stop" size={12} color={colors.textMuted} />
                <Text style={styles.hushText}>{ui('loop.stopTalking', lang)}</Text>
              </Pressable>
            )}

            {recording ? (
              <View style={styles.inputRow}>
                {/* The level bar is not decoration. RN cannot see the waveform, and a listening
                    state that never moves is indistinguishable from a microphone that never
                    opened — which is exactly how a denied permission used to look. */}
                <View style={styles.micLive}>
                  <Text style={styles.micLabel}>
                    {ui(MIC_LABEL[mic.state] ?? 'mic.listening', lang)}
                  </Text>
                  {mic.state === 'listening' && (
                    <View style={styles.levelTrack}>
                      <View style={[styles.levelFill, { width: `${Math.round(clamp(mic.level * 100))}%` }]} />
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.sendBtn}
                  onPress={mic.state === 'listening' ? onMicStop : onMicCancel}
                  accessibilityLabel={ui('mic.listening', lang)}>
                  <Icon name="stop" size={18} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  editable={state.inputEnabled}
                  onChangeText={setInput}
                  placeholder={say(
                    state.screen === 'loop' ? 'loop.placeholder' : 'question.placeholder',
                  )}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  onSubmitEditing={send}
                />
                {/* Mic OR send, never both: the button is the mic until there is something typed,
                    and speaking is the only gesture that needs to be reachable one-handed. */}
                {micAvailable && !input.trim() ? (
                  <Pressable
                    style={[styles.sendBtn, !state.inputEnabled && styles.sendDisabled]}
                    onPress={onMicStart}
                    disabled={!state.inputEnabled}
                    accessibilityLabel={ui('mic.listening', lang)}>
                    <Icon name="mic" size={22} />
                  </Pressable>
                ) : (
                  <Pressable
                    style={[
                      styles.sendBtn,
                      (!input.trim() || !state.inputEnabled) && styles.sendDisabled,
                    ]}
                    onPress={send}
                    disabled={!input.trim() || !state.inputEnabled}>
                    <Icon name="send" size={22} />
                  </Pressable>
                )}
              </View>
            )}
            {/* Leaving is not a conversational move, so it does not sit in the
                pill row next to the follow-up question. */}
            {state.screen === 'loop' && (
              <Pressable style={styles.leave} onPress={onLeave} hitSlop={8}>
                <Text style={styles.leaveText}>{ui('loop.leave', lang)}</Text>
              </Pressable>
            )}
          </SafeAreaView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

/** The free-chat transcript. A staged phase speaks one line through the card and
 *  moves on; a conversation has to stay readable.
 *
 *  It follows the voice. The engine reveals an answer chunk by chunk as each is
 *  spoken, so the newest bubble grows while the counselor talks — and every
 *  growth spurt changes the content size, which is the cue to scroll to the
 *  end. Without it the bubble grew below the fold and the player read the first
 *  sentence while hearing the fourth. */
const Transcript: React.FC<{ state: FlowState }> = ({ state }) => {
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      style={styles.transcript}
      contentContainerStyle={styles.transcriptBody}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      {state.transcript.map((m, i) => (
        <View
          key={`${i}-${m.role}`}
          style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleCounselor]}>
          <Text style={m.role === 'user' ? styles.bubbleTextUser : styles.bubbleText}>{m.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const Report: React.FC<{ state: FlowState }> = ({ state }) => {
  const report = state.report!;
  return (
    <View style={styles.report}>
      {report.rows.map(row => (
        <View key={row.label} style={styles.reportRow}>
          <Text style={styles.reportLabel}>{row.label}</Text>
          <View style={styles.reportTrack}>
            <View style={[styles.reportFill, { width: `${clamp(row.score)}%` }]} />
          </View>
          <Text style={styles.reportScore}>{row.score}</Text>
        </View>
      ))}
      {!!report.keywords && <Text style={styles.reportKeywords}>{report.keywords}</Text>}
      {!!report.period && <Text style={styles.reportPeriod}>{report.period}</Text>}
    </View>
  );
};

/** What the row says for each state the mic can be in while the take is live. */
const MIC_LABEL = {
  opening: 'mic.opening',
  listening: 'mic.listening',
  transcribing: 'mic.transcribing',
  idle: 'mic.listening',
} as const;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Unity reports WHY a take produced nothing as a key; the sentence is RN's, in all six languages.
 *  Everything that is not the player's to fix collapses onto one line — "I could not make out the
 *  words" is as much as a player can act on whether the route 404'd or the upload timed out. */
function micErrorText(error: NonNullable<FlowState['mic']['error']>, lang: Parameters<typeof ui>[1]) {
  switch (error) {
    case 'permission':
      return ui('mic.error.permission', lang);
    case 'no_device':
      return ui('mic.error.nodevice', lang);
    case 'no_speech':
    case 'too_short':
      return ui('mic.error.nospeech', lang);
    // Nothing the player did. Saying "I could not make out the words" here is a lie that reads as
    // "you mumbled" — and the mic button is gone by now anyway, so the line has to explain that.
    case 'unavailable':
    case 'no_token':
      return ui('mic.error.unavailable', lang);
    default:
      return ui('mic.error.failed', lang);
  }
}

/** A hold of 5-30 s with a still card looked exactly like a crash. */
const ThinkingDots: React.FC = () => {
  const [n, setN] = useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setN(v => (v + 1) % 4), 420);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.dots}>{'.'.repeat(n)}</Text>;
};

const styles = StyleSheet.create({
  root: { ...absoluteFill, justifyContent: 'flex-end' },
  stack: { paddingHorizontal: spacing.lg, gap: spacing.sm },

  card: {
    backgroundColor: colors.scrim,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  speaker: { ...typography.caption, color: colors.gold },
  lineScroll: { maxHeight: 220 },
  line: { ...typography.body, color: colors.textPrimary, lineHeight: 23 },
  hint: { ...typography.tiny, color: colors.textMuted, alignSelf: 'flex-end' },
  dots: { ...typography.body, color: colors.violetSoft },

  noticeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  pillPrimary: { backgroundColor: colors.violet },
  pillText: { ...typography.caption, color: colors.textSecondary },
  pillTextPrimary: { ...typography.caption, color: colors.textPrimary },

  choices: { gap: spacing.sm },
  choice: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  choiceText: { ...typography.bodyStrong, color: colors.textPrimary },

  // Sits over the live Unity scene (gold sigils, glyphs), so a 16%-alpha violet pill with violet
  // caption text was unreadable — near-opaque dark ground, violet rim, white body text instead.
  suggestion: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(18, 18, 26, 0.94)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.violetSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  suggestionText: { ...typography.body, color: colors.textPrimary },

  transcript: { maxHeight: 320 },
  transcriptBody: { gap: spacing.sm, paddingBottom: spacing.sm },
  bubble: { borderRadius: radius.md, padding: spacing.md, maxWidth: '86%' },
  bubbleCounselor: { alignSelf: 'flex-start', backgroundColor: colors.scrim },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.violet },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { ...typography.body, color: colors.textPrimary },

  report: {
    backgroundColor: colors.scrim,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportLabel: { ...typography.caption, color: colors.textSecondary, width: 76 },
  reportTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  reportFill: { height: 6, backgroundColor: colors.gold },
  reportScore: { ...typography.tiny, color: colors.textMuted, width: 26, textAlign: 'right' },
  reportKeywords: { ...typography.caption, color: colors.gold },
  reportPeriod: { ...typography.tiny, color: colors.textMuted },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.scrim,
    borderRadius: radius.xl,
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    maxHeight: 110,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.card },

  micError: {
    ...typography.tiny,
    color: colors.gold,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  micLive: { flex: 1, justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  micLabel: { ...typography.caption, color: colors.textSecondary },
  levelTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  levelFill: { height: 4, backgroundColor: colors.violetSoft },

  hush: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  hushText: { ...typography.tiny, color: colors.textMuted },

  leave: { alignSelf: 'center', paddingVertical: spacing.sm },
  leaveText: { ...typography.caption, color: colors.textMuted },
});
