import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import {
  ORIG, OUTFIT_COLORS, catalogFor, encodeOutfit, parseOutfit, randomOutfit, wornSet, withItem, withTint,
  type Outfit, type OutfitItem, type Slot,
} from '../outfitCatalog';

/**
 * The creator's Outfit step (04-11): three tabs under the panel header.
 *   Sets     one row of portrait cards — a full look in one tap; "Custom" leads when the two slots match
 *            no set. The panel is SHORT here so the whole body shows.
 *   Clothes  a Top row and a Bottom row of square tiles, the artist's own piece first in each. Tapping
 *            keeps the slot's tint, drops a painted set (orig only).
 *   Colour   a chip row per slot from OUTFIT_COLORS; the first chip is the item's own colour. Every item
 *            takes a tint (Unity guarantees it), so no chip is ever disabled.
 * The dice picks a random set and tints, Reset returns to "". The camera focus (CHARACTER_VIEW `focus`)
 * follows the tab: the body for the sets, the top or the bottom — whichever row was touched last —
 * for the clothes and the colours.
 */
export type OutfitTab = 'sets' | 'clothes' | 'colour';
export type OutfitFocus = 'body' | 'top' | 'bottom';

/** The share of the screen the panel covers per tab (Unity frames the body above it). */
export const OUTFIT_COVER: Record<OutfitTab, number> = { sets: 0.36, clothes: 0.56, colour: 0.56 };

const TABS: OutfitTab[] = ['sets', 'clothes', 'colour'];
const TAB_LABEL: Record<OutfitTab, TranslationKey> = {
  sets: 'character.outfit.tabSets', clothes: 'character.outfit.tabClothes', colour: 'character.outfit.tabColour',
};

export interface OutfitPanelProps {
  characterId: string | undefined;
  /** The stored form (`t=…;b=…`), always of this body. */
  value: string;
  onChange: (value: string) => void;
  /** Where Unity's camera should look; sent whenever it changes. */
  onFocus: (focus: OutfitFocus) => void;
  /** The tab's cover (OUTFIT_COVER), so the screen can size the panel; sent on mount and on each tab. */
  onCover?: (cover: number) => void;
}

export const OutfitPanel: React.FC<OutfitPanelProps> = ({ characterId, value, onChange, onFocus, onCover }) => {
  const t = useT();
  const cat = catalogFor(characterId);
  const outfit = parseOutfit(value, characterId);
  const [tab, setTab] = useState<OutfitTab>('sets');
  const [lastSlot, setLastSlot] = useState<Slot>('top');
  const worn = wornSet(outfit, characterId);

  // The camera follows the tab, and within the clothes / colours the row last touched.
  const focus: OutfitFocus = tab === 'sets' ? 'body' : lastSlot;
  // The callbacks are the screen's inline closures: only the focus / tab changing should re-send.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onFocus(focus); }, [focus]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onCover?.(OUTFIT_COVER[tab]); }, [tab]);

  const change = (o: Outfit) => onChange(encodeOutfit(o));
  const touch = (slot: Slot) => { if (slot !== lastSlot) setLastSlot(slot); };

  const itemName = (slot: Slot, id: string): string => {
    if (id !== ORIG) return t(`character.outfit.set.${id}` as TranslationKey);
    const key = `character.outfit.orig.${characterId}.${slot}`;
    // A body without its own names (none today) falls back to the plain "Original".
    return characterId && characterId in ORIG_NAMES ? t(key as TranslationKey) : t('character.outfit.original');
  };

  if (!cat) return null;

  const setsRow = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards} testID="character-outfit-row-sets">
      {!worn ? (
        <View testID="character-outfit-set-custom" accessibilityLabel={t('character.outfit.custom')} style={styles.card}>
          <View style={[styles.cardArt, styles.cardArtOn, styles.customArt]}>
            <Text style={styles.customMark}>✦</Text>
          </View>
          <Text style={[styles.cardName, styles.nameOn]} numberOfLines={1}>{t('character.outfit.custom')}</Text>
        </View>
      ) : null}
      {cat.sets.map(s => {
        const on = worn?.id === s.id;
        const name = t(`character.outfit.set.${s.id}` as TranslationKey);
        return (
          <Pressable
            key={s.id}
            testID={`character-outfit-set-${s.id}`}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected: on }}
            onPress={() => { sfx.tap(); change({ top: { ...s.top }, bottom: { ...s.bottom } }); }}
            style={styles.card}>
            <View style={[styles.cardArt, on && styles.cardArtOn]}>
              <Image source={s.thumb} style={styles.fill} resizeMode="cover" />
            </View>
            <Text style={[styles.cardName, on && styles.nameOn]} numberOfLines={1}>{name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const tileRow = (slot: Slot, items: OutfitItem[]) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{t(slot === 'top' ? 'character.outfit.top' : 'character.outfit.bottom')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} testID={`character-outfit-row-${slot}`}>
        {items.map(item => {
          const on = outfit[slot].id === item.id;
          const name = itemName(slot, item.id);
          return (
            <Pressable
              key={item.id}
              testID={`character-outfit-${slot}-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={name}
              accessibilityState={{ selected: on }}
              onPress={() => { sfx.tap(); touch(slot); change(withItem(outfit, slot, item.id)); }}
              style={styles.tile}>
              <View style={[styles.tileArt, on && styles.tileArtOn]}>
                <Image source={item.thumb} style={styles.fill} resizeMode="cover" />
                {on ? <View style={styles.tileCheck}><Text style={styles.tileCheckMark}>✓</Text></View> : null}
              </View>
              <Text style={[styles.tileName, on && styles.nameOn]} numberOfLines={1}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const chipRow = (slot: Slot) => {
    const current = outfit[slot].variant;
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t(slot === 'top' ? 'character.outfit.top' : 'character.outfit.bottom')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} testID={`character-outfit-colour-${slot}`}>
          {OUTFIT_COLORS.map(c => {
            // A painted set rings nothing: it is neither the item's own colour nor a tint.
            const on = current === c.hex;
            return (
              <Pressable
                key={c.hex || 'original'}
                testID={`character-outfit-${slot}-${c.hex ? c.hex.slice(1) : 'original'}`}
                accessibilityRole="button"
                accessibilityLabel={c.hex || t('character.outfit.original')}
                accessibilityState={{ selected: on }}
                onPress={() => { sfx.tap(); touch(slot); change(withTint(outfit, slot, c.hex)); }}
                style={[styles.chipRing, on && styles.chipRingOn]}>
                {c.hex ? (
                  <View style={[styles.chip, { backgroundColor: c.swatch }]} />
                ) : (
                  <View style={[styles.chip, styles.chipOriginal]}>
                    <Text style={styles.chipOriginalText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {t('character.outfit.original')}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.panel} testID="character-outfit-panel">
      <View style={styles.header}>
        <Text style={styles.title}>{t('character.step.outfit')}</Text>
        <View style={styles.headerActions}>
          <Pressable
            testID="character-outfit-dice"
            accessibilityRole="button"
            accessibilityLabel={t('character.outfit.shuffle')}
            hitSlop={6}
            onPress={() => { sfx.tap(); change(randomOutfit(characterId)); }}
            style={styles.dice}>
            <Text style={styles.diceGlyph}>🎲</Text>
          </Pressable>
          <Pressable
            testID="character-outfit-reset"
            accessibilityRole="button"
            accessibilityLabel={t('character.outfit.reset')}
            hitSlop={6}
            onPress={() => { sfx.tap(); onChange(''); }}
            style={styles.reset}>
            <Text style={styles.resetLabel}>{t('character.outfit.reset')}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.tabs}>
        {TABS.map(k => (
          <Pressable
            key={k}
            testID={`character-outfit-tab-${k}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: k === tab }}
            onPress={() => { if (k !== tab) { sfx.tap(); setTab(k); } }}
            style={[styles.tab, k === tab && styles.tabOn]}>
            <Text style={[styles.tabLabel, k === tab && styles.tabLabelOn]} numberOfLines={1}>{t(TAB_LABEL[k])}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'sets' ? setsRow : null}
      {tab === 'clothes' ? (
        <>
          {tileRow('top', cat.tops)}
          {tileRow('bottom', cat.bottoms)}
        </>
      ) : null}
      {tab === 'colour' ? (
        <>
          {chipRow('top')}
          {chipRow('bottom')}
        </>
      ) : null}
    </View>
  );
};

/** The bodies whose own pieces have names in i18n (character.outfit.orig.<body>.<slot>). */
const ORIG_NAMES: Record<string, true> = { xb_m01: true, xb_f01: true };

const TILE = 72;
const CARD_W = 64;
const CARD_H = 85;

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  fill: { width: '100%', height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h3, color: colors.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dice: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  diceGlyph: { fontSize: 18 },
  reset: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.08)' },
  resetLabel: { ...typography.caption, color: colors.textPrimary },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.lg },
  tabOn: { backgroundColor: colors.violet },
  tabLabel: { ...typography.caption, color: colors.textSecondary },
  tabLabelOn: { color: '#fff', fontWeight: '700' },
  nameOn: { color: colors.violetSoft },
  // sets: portrait cards
  cards: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  card: { width: CARD_W + 4, alignItems: 'center', gap: 4 },
  cardArt: {
    width: CARD_W + 4, height: CARD_H + 4, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: 'transparent',
  },
  cardArtOn: { borderColor: colors.violetSoft },
  customArt: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetDim },
  customMark: { fontSize: 22, color: colors.violetSoft },
  cardName: { ...typography.caption, color: colors.textSecondary, maxWidth: '100%' },
  // clothes: square tiles
  row: { gap: 2 },
  rowLabel: { ...typography.caption, color: colors.textMuted },
  tiles: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  tile: { width: TILE + 4, alignItems: 'center', gap: 4 },
  tileArt: {
    width: TILE + 4, height: TILE + 4, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: 'transparent',
  },
  tileArtOn: { borderColor: colors.violetSoft },
  tileCheck: {
    position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center',
  },
  tileCheckMark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  tileName: { ...typography.caption, color: colors.textSecondary, maxWidth: '100%' },
  // colour: chips
  chips: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
  chipRing: { padding: 3, borderRadius: 23, borderWidth: 2, borderColor: 'transparent' },
  chipRingOn: { borderColor: colors.violet },
  chip: { width: 38, height: 38, borderRadius: 19 },
  chipOriginal: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  chipOriginalText: { fontSize: 9, color: colors.textPrimary, textAlign: 'center' },
});
