import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

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

const TINT: Record<BadgeKind, string> = {
  new: colors.new,
  popular: colors.popular,
  trending: colors.trending,
  comingSoon: colors.card,
};

export const Badge: React.FC<{ kind: BadgeKind }> = ({ kind }) => (
  <View style={[styles.badge, { backgroundColor: TINT[kind] }]}>
    <Text style={styles.text}>{LABEL[kind]}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#0A0A0F',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
