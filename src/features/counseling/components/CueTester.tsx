/**
 * DEV ONLY — fire any one of the flow's cues at whoever is in the chair, and be told what the rig
 * actually did with it.
 *
 * WHY IT EXISTS. The flow names 62 cues across 20 phases, and no rig answers all of them: a cue
 * with no parameter, no alias and no special handling is dropped in silence — `Note("anim", …)` and
 * nothing on screen. Which cues a given counselor can perform is not knowable from the project
 * window either, because the answer is three runtime facts at once (the animator's parameter set,
 * the rig's CounselorCueAliases table, and the handful the performer routes to the blink driver or
 * the gaze). Measured 22-09: Yuna answers 47 of 62, Jiho 38, Theo 22, Go Yunjung 15.
 *
 * So this is not a toy. It is the only way to ask a counselor "can you do this?" and get a straight
 * answer, and the only way to watch one cue at a time instead of inferring it from a phase that
 * fired six.
 *
 * ⚠️ IT GOES THROUGH THE ROOM'S ORDINARY PATH. Unity runs the cue through PlayAnimation, the same
 * call a phase makes, so the vote, the held-pose preference and the bool clearing all apply. A
 * tester that poked the Animator directly would be testing the poke.
 *
 * Only mounted under __DEV__; see CounselingRoomScreen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { getUnityBridge } from '../bridge';
import type { UnityToRNEvent } from '../types';

/** The cue lists of consultationFlow.json, grouped the way a person looks for them rather than
 *  the way the phases happen to order them. */
const GROUPS: { label: string; cues: string[] }[] = [
  {
    label: 'Nói / giải thích',
    cues: ['Explain', 'HandGesture', 'HandMove', 'OpenHandGesture', 'OpenHands',
           'OpenPalmGesture', 'PalmOpen', 'HandRaise', 'FingerPoint', 'Point',
           'PointForward', 'PointAtPillars', 'FollowPoint'],
  },
  {
    label: 'Nghĩ / phân tích',
    cues: ['Thinking', 'ThinkingIdle', 'HandOnChin', 'Focus', 'Focused', 'FocusedExpression',
           'FocusedLook', 'Analyze', 'Decision', 'ReturnToAnalyze', 'DeepBreath', 'EyesClose'],
  },
  {
    label: 'Nghe / gật',
    cues: ['Listen', 'Listening', 'ListenMode', 'Nod', 'SlightNod', 'LeanForward',
           'Curious', 'CuriousExpression', 'SitStraight'],
  },
  {
    label: 'Biểu cảm',
    cues: ['Smile', 'SmallSmile', 'GentleSmile', 'CounselorSmile', 'Surprise', 'SlightSurprise',
           'CounselorSlightSurprise', 'Serious', 'ConfidentExpression', 'Blink'],
  },
  {
    label: 'Chào / kết',
    cues: ['GreetingHandGesture', 'SlightBow', 'SmallBow', 'GoodbyeGesture',
           'Idle', 'IdleRelaxed', 'ReturnToIdle'],
  },
  {
    label: 'Ánh mắt',
    cues: ['LookAtPlayer', 'EyeContact', 'CounselorLookAtCustomer',
           'LookAtSaju', 'LookTowardSelectedOption'],
  },
];

/** `"Smile -> trigger Smile"` → how it resolved. Unity sends the whole line in one string so the
 *  bridge stays one shape; splitting it is the display's business. */
function parse(reason: string): { cue: string; how: string } {
  const at = reason.indexOf(' -> ');
  return at < 0 ? { cue: reason, how: '' } : { cue: reason.slice(0, at), how: reason.slice(at + 4) };
}

/** Red for a cue the rig simply cannot perform — that is the finding, not a warning. */
function tone(how: string): string {
  if (!how) return colors.textSecondary;
  if (how === 'missing' || how.includes('MISSING') || how.includes('NOT ON RIG')) return '#ff6b6b';
  if (how.startsWith('alias')) return '#ffd166';
  return '#7ee787';
}

export const CueTester: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string>('');

  useEffect(() => {
    return getUnityBridge().onEvent((e: UnityToRNEvent) => {
      if (e.type !== 'CUE_RESULT') return;
      const { cue, how } = parse(e.payload?.reason ?? '');
      setResults(r => ({ ...r, [cue]: how }));
      setLast(`${cue} → ${how}`);
    });
  }, []);

  const fire = useCallback((cue: string) => {
    getUnityBridge().sendEvent({ type: 'CUE_TEST', payload: { cue } });
  }, []);

  /** Fire a whole group in sequence, slowly enough to watch each one land. */
  const fireAll = useCallback((cues: string[]) => {
    cues.forEach((c, i) => setTimeout(() => fire(c), i * 1400));
  }, [fire]);

  const counts = useMemo(() => {
    const all = GROUPS.flatMap(g => g.cues);
    const answered = all.filter(c => results[c] !== undefined);
    const missing = answered.filter(c => tone(results[c]) === '#ff6b6b');
    return { tried: answered.length, total: all.length, missing: missing.length };
  }, [results]);

  if (!open) {
    return (
      <Pressable style={styles.tab} onPress={() => setOpen(true)}>
        <Text style={styles.tabLabel}>CUE</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.title}>Cue tester</Text>
        <Text style={styles.count}>
          {counts.tried}/{counts.total} đã thử · {counts.missing} thiếu
        </Text>
        <Pressable onPress={() => setOpen(false)} style={styles.close}>
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      {!!last && <Text style={styles.last}>{last}</Text>}

      <ScrollView style={styles.scroll}>
        {GROUPS.map(g => (
          <View key={g.label} style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupLabel}>{g.label}</Text>
              <Pressable onPress={() => fireAll(g.cues)} style={styles.all}>
                <Text style={styles.allLabel}>chạy hết</Text>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {g.cues.map(c => (
                <Pressable key={c} onPress={() => fire(c)} style={styles.chip}>
                  <Text style={[styles.chipLabel, { color: tone(results[c] ?? '') }]}>{c}</Text>
                  {!!results[c] && <Text style={styles.chipHow}>{results[c]}</Text>}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tab: {
    position: 'absolute', right: 0, top: '32%', zIndex: 60, elevation: 60,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(167,139,250,0.35)',
    borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm,
  },
  tabLabel: { ...typography.caption, color: '#fff', letterSpacing: 1 },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%',
    zIndex: 60, elevation: 60,
    backgroundColor: 'rgba(12,12,18,0.96)',
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  count: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  close: { padding: spacing.sm },
  closeLabel: { color: colors.textSecondary, fontSize: 18 },
  last: { ...typography.caption, color: '#7ee787', marginTop: spacing.xs },
  scroll: { marginTop: spacing.sm },
  group: { marginBottom: spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupLabel: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase' },
  all: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  allLabel: { ...typography.caption, color: '#a78bfa' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.07)',
  },
  chipLabel: { ...typography.caption },
  chipHow: { ...typography.caption, color: colors.textSecondary, fontSize: 10 },
});
