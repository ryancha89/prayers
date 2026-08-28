import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

type BadgeKind = 'new' | 'popular' | 'trending';

const LABEL: Record<BadgeKind, string> = {
  new: 'NEW',
  popular: 'POPULAR',
  trending: 'TRENDING',
};

const TINT: Record<BadgeKind, string> = {
  new: colors.new,
  popular: colors.popular,
  trending: colors.trending,
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
