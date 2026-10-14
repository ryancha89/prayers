import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { useT } from '../i18n';

/**
 * A rating as a row of drawn stars — the ★☆ text it replaces fell back to whatever font had them,
 * at whatever weight. `count` filled in `color`; the rest outlined in `color`, or — `offFilled` —
 * filled in `offColor` (the result screen's dim stars). Read out as "4 of 5".
 */
export const StarRating: React.FC<{
  count: number;
  max?: number;
  size?: number;
  color: string;
  offColor?: string;
  offFilled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}> = ({ count, max = 5, size = 16, color, offColor, offFilled, style, testID }) => {
  const t = useT();
  const on = Math.max(0, Math.min(max, Math.round(count)));
  return (
    <View
      style={[styles.row, { gap: Math.round(size * 0.18) }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('common.rating', { count: on, max })}
      testID={testID}>
      {Array.from({ length: max }, (_, i) => (
        i < on
          ? <Icon key={i} name="starFilled" size={size} color={color} />
          : <Icon key={i} name={offFilled ? 'starFilled' : 'star'} size={size} color={offColor ?? color} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
