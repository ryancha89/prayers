import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { spacing } from '../../../../shared/theme';
import { useLang, useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { awaitReflection } from '../diaryApi';
import type { DiaryReflection } from '../diaryStore';
import { diaryCounselorFor } from '../counselors';
import { ReflectionNote, UserBubble } from './DiaryBubbles';
import { usePlayerName } from '../../components/ProfileSheet';
import { TopicChips } from './TopicChips';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/** What the Saved screen is showing. `offline`: the server never answered (not signed in, no
 *  network) — the entry is safe on the phone. `later`: still pending when the 45 s wait ran out. */
export type SavedView =
  | { kind: 'pending' }
  /** The entry's AI switch is off: nothing is asked for, the page is the player's alone. */
  | { kind: 'private' }
  | { kind: 'reflection'; reflection: DiaryReflection }
  | { kind: 'offline' }
  | { kind: 'later' };

/**
 * Diary Saved (spec 006 US2; reworked 08-10 for "the diary is for the user"): the player's bubble with
 * the start of the page they wrote, Today's Reflection as a reply card under it, its topic chips,
 * then View this page (the one gold action) and Talk with <counsellor> — named, since nothing else on
 * the screen says who that is.
 *
 * SOMETHING MEANINGFUL ON THE FIRST FRAME (SC-003): it opens on "Reading your page…" before any
 * request has gone out, then shows whatever the server says — its reflection, or its own fallback
 * line. The reflection text is always the server's (FR-005). With the AI switch off nothing is asked
 * for (US2-3) and the card says the page is kept just for the player.
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
  const aiOn = memory?.aiEnabled !== false;
  const [view, setView] = useState<SavedView>(aiOn ? { kind: 'pending' } : { kind: 'private' });
  const playerName = usePlayerName();

  useEffect(() => {
    if (!aiOn) return;
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
  }, [memoryId, lang, aiOn]);

  const line =
    view.kind === 'reflection' ? view.reflection.text
      : view.kind === 'private' ? t('diary.saved.private')
      : view.kind === 'offline' ? t('diary.saved.offline', { name })
        : view.kind === 'later' ? t('diary.saved.later', { name })
          : t('diary.saved.pending', { name });

  return (
    <View style={s.root} testID="diary-saved">
      <View style={s.sheet}>
        <SheetHead title={t('diary.saved.title')} onClose={onClose} closeTestID="diary-saved-close" />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <UserBubble name={playerName} text={memory?.content ?? ''} lines={3} testID="diary-saved-page" />
          <ReflectionNote
            title={t('diary.saved.reflection')}
            text={line}
            busy={view.kind === 'pending'}
            muted={view.kind !== 'reflection'}
            testID="diary-saved-line"
          />
          {view.kind === 'reflection' && view.reflection.topics.length > 0 && (
            <View>
              <Text style={s.label}>{t('diary.saved.topics')}</Text>
              <TopicChips topics={view.reflection.topics} />
            </View>
          )}
          <Pressable testID="diary-saved-view" onPress={() => { sfx.tap(); onView(); }} accessibilityRole="button"
            style={({ pressed }) => [s.gold, pressed && s.pressed]}>
            <Text style={s.goldText}>{t('diary.saved.view')}</Text>
          </Pressable>
          {!!who && (
            <Pressable testID="diary-saved-talk" onPress={() => { sfx.select(); onTalk(); }} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
              <Text style={s.ghostText}>{t('diary.saved.talkWith', { name })}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </View>
  );
};


