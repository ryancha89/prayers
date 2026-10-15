import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import type { ArchiveMemory } from '../../../archive/types';
import { useDiaryStore } from '../diaryStore';
import { formatDay } from '../text';
import { entryDay, entryTopics, isFavorite, moodColor } from '../stats';
import { MoodFace } from './MoodFace';
import { TopicChips } from './TopicChips';
import { DiaryImage } from './DiaryImage';
import { diaryStyles as s } from './diaryTheme';

/** One entry in a diary list (My Diary, a calendar day, Browse): first photo, date, kind, excerpt,
 *  topic chips, and the mood face in its colour — the My Diary mockup's row. */
export const DiaryRow: React.FC<{ memory: ArchiveMemory; onOpen(id: string): void }> = ({ memory: m, onOpen }) => {
  const t = useT();
  const lang = useLang();
  const unsynced = useArchiveStore(st => st.dirty.includes(m.id));
  const thumb = useDiaryStore(st => st.photos[m.id]?.[0]);
  const reflection = useDiaryStore(st => st.reflections[m.id]);
  const topics = reflection ? entryTopics(m, { [m.id]: reflection }) : [];
  const tint = m.category === 'diary' ? moodColor(m.details.mood) : undefined;

  return (
    <Pressable
      testID={`diary-row-${m.id}`}
      onPress={() => { sfx.tap(); onOpen(m.id); }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && s.pressed]}>
      {thumb ? (
        <DiaryImage localUri={thumb.localUri} url={thumb.url} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.noThumb]}>
          <Icon name="book" size={22} color={colors.gold} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.meta}>
          <Text style={styles.date}>{formatDay(entryDay(m), lang)}</Text>
          {isFavorite(m) && <Icon name="heartFilled" size={12} color="#F87171" />}
        </View>
        <Text style={styles.excerpt} numberOfLines={2}>{m.content}</Text>
        <View style={styles.meta}>
          <Text style={styles.kind}>{t(`diary.kind.${m.category}` as TranslationKey)}</Text>
          {unsynced && <Text style={styles.unsynced}>{t('diary.list.unsynced')}</Text>}
        </View>
        <TopicChips topics={topics} small />
      </View>
      {tint && <MoodFace mood={m.details.mood} size={26} color={tint} fill={`${tint}33`} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.14)',
  },
  thumb: { width: 72, height: 72, borderRadius: radius.sm },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,196,106,0.08)' },
  body: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  date: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  kind: { ...typography.tiny, color: colors.textMuted },
  unsynced: { ...typography.tiny, color: '#F4A261' },
  excerpt: { ...typography.caption, color: colors.textSecondary },
});
