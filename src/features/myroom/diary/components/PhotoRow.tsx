import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { DiaryImage } from './DiaryImage';
import { MAX_PHOTOS } from '../photos';

export interface RowPhoto { id: string; localUri?: string; url?: string }

/**
 * Write's Add Photo row: the entry's photos with a remove ×, then the add tile while there is room.
 * `note` is what the last pick said — denied (with the way to Settings), not available in this
 * build, or a pick that left no readable file — and the text still saves either way.
 *
 * A tile always shows something: a dim plate with an image glyph sits under the photo, so a photo
 * that fails to load is a visible empty frame, never an invisible × floating on the sheet.
 */
export const PhotoRow: React.FC<{
  photos: RowPhoto[];
  onAdd(): void;
  onRemove(id: string): void;
  note: 'denied' | 'unavailable' | 'failed' | null;
}> = ({ photos, onAdd, onRemove, note }) => {
  const t = useT();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        {photos.map(p => (
          <View key={p.id} style={[styles.tile, styles.plate]} testID={`diary-photo-${p.id}`}>
            <View style={styles.glyph} pointerEvents="none">
              <Icon name="image" size={22} color="rgba(233,196,106,0.45)" />
            </View>
            <DiaryImage localUri={p.localUri} url={p.url} style={styles.img} testID={`diary-photo-img-${p.id}`} />
            <Pressable
              hitSlop={8}
              onPress={() => onRemove(p.id)}
              accessibilityRole="button"
              accessibilityLabel={t('diary.photo.remove')}
              style={styles.remove}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable
            testID="diary-add-photo"
            onPress={onAdd}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tile, styles.add, pressed && { opacity: 0.7 }]}>
            <Icon name="image" size={20} color={colors.gold} />
            <Text style={styles.addText} numberOfLines={1}>{t('diary.write.addPhoto')}</Text>
            <Text style={styles.count}>{photos.length}/{MAX_PHOTOS}</Text>
          </Pressable>
        )}
      </View>
      {note === 'denied' && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{t('diary.photo.denied')}</Text>
          <Pressable onPress={() => { sfx.tap(); Linking.openSettings().catch(() => {}); }} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>{t('diary.photo.settings')}</Text>
          </Pressable>
        </View>
      )}
      {note === 'unavailable' && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{t('diary.photo.unavailable')}</Text>
        </View>
      )}
      {note === 'failed' && (
        <View style={styles.note} testID="diary-photo-failed">
          <Text style={styles.noteText}>{t('diary.photo.failed')}</Text>
        </View>
      )}
    </View>
  );
};

const TILE = 72;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: TILE, height: TILE, borderRadius: radius.sm, overflow: 'hidden' },
  plate: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)' },
  glyph: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Inside the 1-pt border, so the plate's edge still frames a loaded photo.
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  add: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(233,196,106,0.06)',
  },
  addText: { ...typography.tiny, color: colors.gold, paddingHorizontal: 2 },
  count: { ...typography.tiny, color: colors.textMuted },
  remove: {
    position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)',
  },
  removeText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  note: { gap: 4, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.05)' },
  noteText: { ...typography.caption, color: colors.textSecondary },
  link: { ...typography.caption, color: colors.gold, fontWeight: '700' },
});
