import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors } from '../theme';

type BadgeKind = 'new' | 'popular' | 'trending' | 'comingSoon';

const LABEL: Record<BadgeKind, string> = {
  new: 'NEW',
  popular: 'POPULAR',
  trending: 'TRENDING',
  // Not a promotion like the other three — this one says the counselor cannot be consulted yet.
  // It outranks them on the card for that reason: "NEW" over a character you cannot open is worse
  // than no badge at all.
  comingSoon: 'COMING SOON',
};

/**
 * The badge's accent: the text, the dot and the hairline border. 10-17 ("new마크 세련되게"): the old
 * badge was a flat mint slab that shouted over the art; it is a dark glass pill now, with the accent
 * kept to a thin line, a small dot and spaced capitals.
 */
const TINT: Record<BadgeKind, string> = {
  new: colors.gold,
  popular: colors.popular,
  trending: colors.trending,
  comingSoon: colors.textSecondary,
};

export const Badge: React.FC<{ kind: BadgeKind }> = ({ kind }) => (
  <View style={[styles.badge, { borderColor: `${TINT[kind]}99` }]}>
    <View style={[styles.dot, { backgroundColor: TINT[kind] }]} />
    <Text style={[styles.text, { color: TINT[kind] }]}>{LABEL[kind]}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 7,
    paddingRight: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(8,8,18,0.55)',
    alignSelf: 'flex-start',
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  text: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
});
