import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, spacing, typography } from '../../../../shared/theme';
import { useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { DiaryImage } from './DiaryImage';
import type { RowPhoto } from './PhotoRow';

/**
 * A page's photos, full screen (08-10: the strip on Detail was 140pt tiles that nothing opened).
 * Swipe between them, a "2 / 3" counter, and one way out — the × or the hardware back. The image
 * fits the screen whole (contain), in either orientation; the room behind stays as it was.
 */
export const PhotoViewer: React.FC<{ photos: RowPhoto[]; start: number; onClose(): void }> = ({ photos, start, onClose }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<RowPhoto>>(null);
  // A rotation changes the page width: stay on the same photo.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: index * width, animated: false });
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { sfx.back(); onClose(); };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.root} testID="diary-photo-viewer">
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={p => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
          renderItem={({ item }) => (
            <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              <DiaryImage localUri={item.localUri} url={item.url} resizeMode="contain"
                style={{ width: width - safe.left - safe.right, height: height - safe.top - safe.bottom }}
                testID={`diary-viewer-img-${item.id}`} />
            </View>
          )}
        />
        <View pointerEvents="box-none" style={[styles.bar, { top: safe.top + spacing.sm, left: safe.left + spacing.lg, right: safe.right + spacing.lg }]}>
          <Text style={styles.count} testID="diary-viewer-count">{photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}</Text>
          <Pressable testID="diary-viewer-close" onPress={close} accessibilityRole="button" accessibilityLabel={t('diary.close')} style={styles.close}>
            <Icon name="close" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(6,5,16,0.96)' },
  bar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...typography.bodyStrong, color: colors.textPrimary },
  close: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
