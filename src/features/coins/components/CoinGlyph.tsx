import React from 'react';
import { Image, StyleSheet } from 'react-native';

/**
 * The coin, drawn (13-10): a gold cash coin with the eight trigrams round its square hole, made with
 * codex image gen (source: Tools/coin_art/coin_a.png). It replaces the two-ring vector glyph wherever
 * the coin sits on a dark surface. On a gold button keep <Icon name="coin" color={INK} />: gold on
 * gold disappears.
 */
const COIN = require('../assets/coin.png');

export const CoinGlyph: React.FC<{ size: number }> = ({ size }) => (
  <Image source={COIN} style={[styles.coin, { width: size, height: size }]} accessibilityIgnoresInvertColors />
);

const styles = StyleSheet.create({ coin: { resizeMode: 'contain' } });
