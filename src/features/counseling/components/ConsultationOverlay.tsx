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
import React, { useState } from 'react';
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
import { useLang } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { ui } from '../flow/strings';
import type { FlowState } from '../flow/engine';
import type { PhaseChoice } from '../flow/types';

export interface ConsultationOverlayProps {
  state: FlowState;
  onTap(): void;
  onChoose(choice: PhaseChoice): void;
  onSubmit(text: string): void;
  onRetry(): void;
  onLeave(): void;
}

export const ConsultationOverlay: React.FC<ConsultationOverlayProps> = ({
  state,
  onTap,
  onChoose,
  onSubmit,
  onRetry,
  onLeave,
}) => {
  const lang = useLang();
  const [input, setInput] = useState('');

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
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
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                editable={state.inputEnabled}
                onChangeText={setInput}
                placeholder={ui(
                  state.screen === 'loop' ? 'loop.placeholder' : 'question.placeholder',
                  lang,
                )}
                placeholderTextColor={colors.textMuted}
                multiline
                onSubmitEditing={send}
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  (!input.trim() || !state.inputEnabled) && styles.sendDisabled,
                ]}
                onPress={send}
                disabled={!input.trim() || !state.inputEnabled}>
                <Icon name="send" size={22} />
              </Pressable>
            </View>
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
 *  moves on; a conversation has to stay readable. */
const Transcript: React.FC<{ state: FlowState }> = ({ state }) => (
  <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptBody}>
    {state.transcript.map((m, i) => (
      <View
        key={`${i}-${m.role}`}
        style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleCounselor]}>
        <Text style={m.role === 'user' ? styles.bubbleTextUser : styles.bubbleText}>{m.text}</Text>
      </View>
    ))}
  </ScrollView>
);

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

const clamp = (n: number) => Math.max(0, Math.min(100, n));

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

  suggestion: {
    alignSelf: 'flex-start',
    backgroundColor: colors.violetDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  suggestionText: { ...typography.caption, color: colors.violetSoft },

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

  leave: { alignSelf: 'center', paddingVertical: spacing.sm },
  leaveText: { ...typography.caption, color: colors.textMuted },
});
