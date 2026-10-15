import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { PRAYER_COIN_ART as COIN } from '../../tickets/assets/art';

/**
 * The coin, drawn: 10-15 the Prayer Coin (the one currency) — the same art as the Prayer Coins
 * screen and the home pill, so a price, a balance and the shop all show one coin. On a gold button
 * keep <Icon name="coin" color={INK} />: gold on gold disappears.
 */
export const CoinGlyph: React.FC<{ size: number }> = ({ size }) => (
  <Image source={COIN} style={[styles.coin, { width: size, height: size }]} accessibilityIgnoresInvertColors />
);

const styles = StyleSheet.create({ coin: { resizeMode: 'contain' } });
