import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { pushArchive } from '../../../archive/api/memoriesApi';
import { MOOD_ICON } from '../../../archive/types';
import { MoodFace } from './MoodFace';
import { useDiaryStore } from '../diaryStore';
import { diaryCounselorFor } from '../counselors';
import { deleteDiaryEntry } from '../diaryActions';
import { formatDay } from '../text';
import { isFavorite, withFavorite } from '../stats';
import { CounselorBubble } from './CounselorBubble';
import { TopicChips } from './TopicChips';
import { DiaryImage } from './DiaryImage';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/**
 * Diary Detail (spec 006 US3): date, kind and mood, the photo strip, the whole text, and Today's
 * Reflection — marked when it was written before the last edit. Edit reopens Write; Delete removes
 * the entry, its photos and its reflection (the book falls back to the next newest by itself).
 */
export const DiaryDetailSheet: React.FC<{
  memoryId: string;
  onEdit(): void;
  onTalk(): void;
  onDeleted(): void;
  onClose(): void;
}> = ({ memoryId, onEdit, onTalk, onDeleted, onClose }) => {
  const t = useT();
  const lang = useLang();
  const safe = useSafeAreaInsets();
  const m = useArchiveStore(st => st.memories.find(x => x.id === memoryId));
  const reflection = useDiaryStore(st => st.reflections[memoryId]);
  const photos = useDiaryStore(st => st.photos[memoryId]);
  const who = diaryCounselorFor(m?.details.counselor, lang);

  if (!m) return null;
  const fav = isFavorite(m);

  const del = () => {
    sfx.tap();
    Alert.alert(t('diary.detail.deleteConfirm'), undefined, [
      { text: t('archive.cancel'), style: 'cancel' },
      {
        text: t('diary.detail.delete'),
        style: 'destructive',
        onPress: () => {
          deleteDiaryEntry(memoryId).catch(() => {});
          onDeleted();
        },
      },
    ]);
  };

  const line = !reflection
    ? t('diary.detail.noReflection')
    : reflection.status === 'pending'
      ? t('diary.saved.pending', { name: who?.counselor.name ?? '' })
      : reflection.text;

  return (
    <View style={s.root} testID="diary-detail">
      <View style={s.sheet}>
        <SheetHead
          title={formatDay(m.details.date || m.createdAt.slice(0, 10), lang)}
          onClose={onClose}
          closeTestID="diary-detail-close"
          right={
            <View style={styles.headIcons}>
              <Pressable testID="diary-detail-favorite" hitSlop={10} accessibilityRole="button"
                accessibilityLabel={t('diary.list.favorites')} accessibilityState={{ selected: fav }}
                onPress={() => {
                  sfx.tap();
                  useArchiveStore.getState().update(memoryId, { details: withFavorite(m.details, !fav) });
                  pushArchive().catch(() => {});
                }}>
                <Icon name={fav ? 'heartFilled' : 'heart'} size={20} color={fav ? '#F87171' : colors.textPrimary} />
              </Pressable>
              <Pressable testID="diary-detail-edit" hitSlop={10} accessibilityRole="button" onPress={() => { sfx.tap(); onEdit(); }}>
                <Text style={s.headBtnText}>{t('diary.detail.edit')}</Text>
              </Pressable>
            </View>
          }
        />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <View style={styles.meta}>
            <Text style={styles.kind}>{t(`diary.kind.${m.category}` as TranslationKey)}</Text>
            {m.category === 'diary' && !!MOOD_ICON[m.details.mood] && (
              <View style={styles.moodLine}>
                <MoodFace mood={m.details.mood} size={18} color={colors.gold} />
                <Text style={styles.kind}>{t(`archive.mood.${m.details.mood}` as TranslationKey)}</Text>
              </View>
            )}
          </View>

          {!!photos?.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {photos.map(p => <DiaryImage key={p.id} localUri={p.localUri} url={p.url} style={styles.photo} />)}
            </ScrollView>
          )}

          <View style={s.panel}>
            <Text style={s.body} selectable testID="diary-detail-text">{m.content}</Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.heading}>{t('diary.saved.reflection')}</Text>
            <CounselorBubble counselor={who?.counselor} text={line} testID="diary-detail-reflection" />
            {reflection?.stale && <Text style={s.muted}>{t('diary.detail.stale')}</Text>}
            {reflection?.status === 'ready' && <TopicChips topics={reflection.topics} />}
          </View>

          <Pressable testID="diary-detail-talk" disabled={!who} onPress={() => { sfx.select(); onTalk(); }} accessibilityRole="button"
            style={({ pressed }) => [s.gold, !who && s.disabled, pressed && s.pressed]}>
            <Text style={s.goldText}>{t('diary.saved.talk')}</Text>
          </Pressable>
          <Pressable testID="diary-detail-delete" onPress={del} accessibilityRole="button" style={styles.delete}>
            <Text style={styles.deleteText}>{t('diary.detail.delete')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  moodLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexDirection: 'row', gap: spacing.md },
  kind: { ...typography.caption, color: colors.textSecondary },
  strip: { gap: spacing.sm },
  photo: { width: 140, height: 140, borderRadius: radius.md },
  heading: { ...typography.h3, color: colors.gold },
  delete: { alignSelf: 'center', padding: spacing.sm },
  deleteText: { ...typography.caption, color: '#F87171', fontWeight: '700' },
});
