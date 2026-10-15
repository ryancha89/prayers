import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius } from '../../../shared/theme';
import { itemThumb, placeholderIcon, skinThumb } from '../thumbs';
import { swatchFor } from '../edit/decorate';

/**
 * A piece's picture on a soft card: Unity's render of the prefab, or — for a piece this build has
 * no picture for — its category's line icon in the same card, so a row never jumps in size.
 */
export const ItemThumb: React.FC<{
  id: string;
  size: number;
  category?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}> = ({ id, size, category, style, testID }) => {
  const src = itemThumb(id);
  return (
    <View style={[styles.card, { width: size, height: size, borderRadius: Math.max(6, size * 0.16) }, style]} testID={testID}>
      {src ? (
        <Image source={src} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" testID={testID && `${testID}-image`} />
      ) : (
        <Icon name={placeholderIcon(category)} size={Math.round(size * 0.5)} color={colors.textSecondary} testID={testID && `${testID}-placeholder`} />
      )}
    </View>
  );
};

/**
 * A skin's picture, 16:10: the room in that skin, or its colour swatch when there is no render yet.
 */
export const SkinThumb: React.FC<{ id: string; width: number; testID?: string }> = ({ id, width, testID }) => {
  const src = skinThumb(id);
  const height = Math.round((width * 10) / 16);
  return src ? (
    <Image source={src} style={[styles.skin, { width, height }]} resizeMode="cover" testID={testID && `${testID}-image`} />
  ) : (
    <View style={[styles.skin, styles.swatch, { width, height }]} testID={testID && `${testID}-swatch`}>
      {swatchFor(id).map((c, i) => <View key={i} style={[styles.band, { backgroundColor: c }]} />)}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(247,240,228,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.35)',
  },
  skin: { borderRadius: radius.sm, overflow: 'hidden' },
  swatch: { flexDirection: 'row' },
  band: { flex: 1 },
});
