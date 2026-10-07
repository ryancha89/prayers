import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { colors, spacing, typography } from '../../../../shared/theme';
import { useLang, useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { awaitReflection } from '../diaryApi';
import type { DiaryReflection } from '../diaryStore';
import { diaryCounselorFor } from '../counselors';
import { CounselorBubble } from './CounselorBubble';
import { TopicChips } from './TopicChips';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/** What the Saved screen is showing. `offline`: the server never answered (not signed in, no
 *  network) — the entry is safe on the phone. `later`: still pending when the 45 s wait ran out. */
export type SavedView =
  | { kind: 'pending' }
  | { kind: 'reflection'; reflection: DiaryReflection }
  | { kind: 'offline' }
  | { kind: 'later' };

/**
 * Diary Saved (spec 006 US2): the entry's counsellor, a speech bubble, Today's Reflection, its topic
 * chips, and View Diary / Talk to Counselor.
 *
 * SOMETHING MEANINGFUL ON THE FIRST FRAME (SC-003): it opens on "{name} is reading your page…"
 * before any request has gone out, then shows whatever the server says — its reflection, or its own
 * fallback line. The reflection text is always the server's (FR-005); the two other lines say where
 * the entry is, not what the counsellor thinks.
 */
export const DiarySavedSheet: React.FC<{
  memoryId: string;
  onView(): void;
  onTalk(): void;
  onClose(): void;
}> = ({ memoryId, onView, onTalk, onClose }) => {
  const t = useT();
  const lang = useLang();
  const safe = useSafeAreaInsets();
  const memory = useArchiveStore(st => st.memories.find(m => m.id === memoryId));
  const who = diaryCounselorFor(memory?.details.counselor, lang);
  const name = who?.counselor.name ?? '';
  const [view, setView] = useState<SavedView>({ kind: 'pending' });

  useEffect(() => {
    const signal = { aborted: false };
    awaitReflection(memoryId, lang, {
      signal,
      onUpdate: r => { if (!signal.aborted && r.status !== 'pending') setView({ kind: 'reflection', reflection: r }); },
    }).then(last => {
      if (signal.aborted) return;
      if (!last) setView({ kind: 'offline' });
      else if (last.status === 'pending') setView({ kind: 'later' });
    });
    return () => { signal.aborted = true; };
  }, [memoryId, lang]);

  const line =
    view.kind === 'reflection' ? view.reflection.text
      : view.kind === 'offline' ? t('diary.saved.offline', { name })
        : view.kind === 'later' ? t('diary.saved.later', { name })
          : t('diary.saved.pending', { name });

  return (
    <View style={s.root} testID="diary-saved">
      <View style={s.sheet}>
        <SheetHead title={t('diary.saved.title')} onClose={onClose} closeTestID="diary-saved-close" />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <Text style={styles.heading}>{t('diary.saved.reflection')}</Text>
          <CounselorBubble counselor={who?.counselor} text={line} busy={view.kind === 'pending'} testID="diary-saved-line" />
          {view.kind === 'reflection' && view.reflection.topics.length > 0 && (
            <View>
              <Text style={s.label}>{t('diary.saved.topics')}</Text>
              <TopicChips topics={view.reflection.topics} />
            </View>
          )}
          <View style={styles.actions}>
            <Pressable testID="diary-saved-view" onPress={() => { sfx.tap(); onView(); }} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, styles.flex, pressed && s.pressed]}>
              <Text style={s.ghostText}>{t('diary.saved.view')}</Text>
            </Pressable>
            <Pressable testID="diary-saved-talk" disabled={!who} onPress={() => { sfx.select(); onTalk(); }} accessibilityRole="button"
              style={({ pressed }) => [s.gold, styles.flex, !who && s.disabled, pressed && s.pressed]}>
              <Text style={s.goldText}>{t('diary.saved.talk')}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => { sfx.back(); onClose(); }} accessibilityRole="button" style={styles.done}>
            <Text style={s.muted}>{t('diary.saved.done')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heading: { ...typography.h2, color: colors.gold, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  done: { alignSelf: 'center', padding: spacing.sm },
});
