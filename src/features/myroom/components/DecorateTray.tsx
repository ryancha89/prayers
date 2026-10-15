import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import { CoinPill } from '../../coins/components/CoinPill';
import type { MyRoomLayout, MyRoomOwned } from '../../counseling/types';
import { copiesLeft, roomCounts, type Skin } from '../edit/decorate';
import type { CatalogItem } from '../api/myRoomApi';
import { ItemThumb, SkinThumb } from './ItemThumb';
import { SECTION_LABEL, bySection } from '../sections';
import { MYROOM_FEATURES } from '../edit/features';
import { formatCoins } from '../../coins/format';
import { CoinGlyph } from '../../coins/components/CoinGlyph';
import { itemName, themeName } from '../names';
import { DecorShop } from './DecorShop';

export type DecorTab = 'owned' | 'skins' | 'shop';
const TAB_LABEL = { owned: 'myroom.decor.owned', skins: 'myroom.decor.skins', shop: 'myroom.decor.shop' } as const;

/** The tray's ceiling, as a share of the window height. Collapsed it is a strip the room shows
 *  above (sim QA 14-10: a fixed 36 % panel holding one row hid the room being arranged); expanded
 *  it is for browsing the shop. Exported for the layout test. */
export const TRAY_SHARE = { collapsed: 0.3, expanded: 0.6 } as const;

export const trayCap = (windowHeight: number, expanded: boolean) =>
  Math.round(windowHeight * (expanded ? TRAY_SHARE.expanded : TRAY_SHARE.collapsed));

/** The least the tray shrinks to under a tall selection bar on a short phone: handle, tabs, a strip. */
const TRAY_FLOOR = 120;

/**
 * The tray panel's maxHeight, so that the WHOLE dock — selection bar, tray, and the home-indicator
 * padding (inside the panel: maxHeight counts padding) — stays within `trayCap`. Sim run3 measured
 * 0.70 expanded: the old cap was the content's alone, with the safe-area padding (~0.04) and the
 * selection bar (~0.06) stacked on top of the 0.60. Exported for the layout test.
 */
export const trayMaxHeight = (windowHeight: number, expanded: boolean, selectionHeight: number) =>
  Math.max(TRAY_FLOOR, trayCap(windowHeight, expanded) - selectionHeight);

/** A drag on the handle further than this opens (up) or closes (down) the tray; less is a tap. */
const HANDLE_SLOP = 8;

/**
 * Decorate mode's dock at the bottom of the room (spec 005 T025/T033): the selected piece's
 * controls (`top`, only while something is selected) over the tray.
 *
 *   보관함 (Storage) each owned piece with a copy not standing in the room (labelled Storage, not
 *                Owned: a tab saying "Owned ×1" over a full room read as "I own one thing", 14-10) — owned copies minus the
 *                copies in the edit's working layout. A tap adds one (MYROOM_ADD). Collapsed: one
 *                horizontal strip of cards; expanded: a list.
 *   스킨 (Skins) the themes — the catalog's and the owned ones — as swatch cards in one strip. A tap
 *                previews it (MYROOM_THEME); an unowned one can be looked at, not kept (DecorateBar).
 *   상점 (Shop)  the catalog (DecorShop). Opening it expands the tray. A copy bought there is in
 *                Owned at once.
 *
 * SIZED BY ITS CONTENT, capped (TRAY_SHARE): no fixed height, so a tray holding one piece is one
 * strip tall. The dock's own onLayout is what the screen reports as the bottom VIEW_INSET — the real
 * covered height, selection bar included — and Unity frames the room inside what is left. Expanding,
 * collapsing and selecting all re-lay it out, and so re-send it.
 */
export const DecorateTray: React.FC<{
  owned: MyRoomOwned | null;
  layout: MyRoomLayout | null;
  bottomInset: number;
  top?: React.ReactNode;
  onAdd(item: string): void;
  /** Skins (US3): what to offer, which one the room wears now, and a tap's preview. */
  skins?: Skin[];
  currentTheme?: string | null;
  onTheme?(id: string): void;
  /** The catalog, for a picture-less piece's placeholder icon (by category). */
  catalog?: CatalogItem[] | null;
  /** The server sells single pieces now. False (stage 1, skins only): no Shop tab, and Storage
   *  never offers to buy. */
  furnitureForSale?: boolean;
  /** A purchase in the Shop came back 403 NOT_FOR_SALE. */
  onNotForSale?(): void;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
}> = ({ owned, layout, bottomInset, top, onAdd, skins = [], currentTheme = null, onTheme, catalog, furnitureForSale = false, onNotForSale, onLayout }) => {
  const t = useT();
  const screen = useScreen();
  const [chosen, setTab] = useState<DecorTab>(MYROOM_FEATURES.storage ? 'owned' : 'skins');
  const tabs: DecorTab[] = [
    ...(MYROOM_FEATURES.storage ? ['owned' as const] : []),
    'skins' as const,
    ...(furnitureForSale ? ['shop' as const] : []),
  ];
  // One section left (stage 1: Skins): no tab row, a title instead — and nothing to expand.
  const single = tabs.length === 1;
  // The Shop can go while it is open (the flag turned off, or a 403): Storage, then.
  const tab: DecorTab = tabs.includes(chosen) ? chosen : tabs[0];
  const [expanded, setExpanded] = useState(false);
  // The selection bar's measured height, taken off the tray's cap (see trayMaxHeight).
  const [selectionH, setSelectionH] = useState(0);
  const known = (id: string) => itemName(t, id) !== '';
  const categoryOf = (id: string) => catalog?.find(c => c.id === id)?.category;
  const left = Object.entries(copiesLeft(owned, layout)).filter(([id]) => known(id));
  // Storage in the Shop's sections (myroom/sections.ts), in the same order.
  const groups = bySection(left, ([id]) => categoryOf(id));
  // Counts on the tabs and a summary line (14-10: "Owned ×1" over a full room read as "you own one").
  const counts = roomCounts(owned, layout, known);
  const tabLabel = (k: DecorTab) =>
    k === 'owned' ? `${t(TAB_LABEL.owned)} (${counts.storage})`
    : k === 'skins' ? `${t(TAB_LABEL.skins)} (${skins.length})`
    : t(TAB_LABEL.shop);

  const open = (on: boolean) => {
    if (on === expanded) return;
    sfx.tap();
    setExpanded(on);
    // The shop needs the room to browse; collapsed, it goes back to the owned strip.
    if (!on && chosen === 'shop') setTab('owned');
  };
  const openRef = useRef(open);
  openRef.current = open;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const handle = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -HANDLE_SLOP) openRef.current(true);
      else if (g.dy > HANDLE_SLOP) openRef.current(false);
      else openRef.current(!expandedRef.current);
    },
  }), []);

  const pick = (k: DecorTab) => {
    sfx.tap();
    setTab(k);
    if (k === 'shop') setExpanded(true);
  };

  return (
    <View testID="myroom-decorate-dock" onLayout={onLayout} pointerEvents="box-none" style={styles.dock}>
      {top ? (
        <View testID="myroom-decorate-selection-wrap" style={styles.selection} onLayout={e => setSelectionH(e.nativeEvent.layout.height)}>
          {top}
        </View>
      ) : null}
      <View
        testID="myroom-decorate-tray"
        style={[styles.tray, { maxHeight: trayMaxHeight(screen.height, expanded, top ? selectionH : 0), paddingBottom: bottomInset }]}>
        {!single && (
        <View
          testID="myroom-decorate-handle"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(expanded ? 'myroom.edit.collapse' : 'myroom.edit.expand')}
          accessibilityState={{ expanded }}
          onAccessibilityTap={() => open(!expanded)}
          style={styles.handleHit}
          {...handle.panHandlers}>
          <View style={styles.handle} />
        </View>
        )}
        {single ? (
          <View style={[styles.tabsRow, styles.titleRow]}>
            <Text style={styles.trayTitle} testID="myroom-decor-title">{t(TAB_LABEL[tab])}</Text>
            <CoinPill />
          </View>
        ) : (
        <View style={styles.tabsRow}>
          {/* The tabs scroll if a language's labels are long; the coin pill keeps its own room at the
              right (sim QA run4: at 402 pt the pill was clipped by three fixed-width tabs). */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
            {tabs.map(k => (
              <Pressable
                key={k}
                testID={`myroom-decor-tab-${k}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === k }}
                accessibilityLabel={tabLabel(k)}
                onPress={() => pick(k)}
                style={[styles.tab, tab === k && styles.tabOn]}>
                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
                  {tabLabel(k)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <CoinPill />
        </View>
        )}
        {tab === 'skins' ? (
          // One strip in either state: four skins at most, and the room is what they are judged on.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="myroom-decor-skins">
            {skins.map(s => (
              <SkinCard key={s.id} skin={s} current={s.id === currentTheme} onPress={() => onTheme?.(s.id)} />
            ))}
          </ScrollView>
        ) : tab === 'shop' ? (
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
            <DecorShop onNotForSale={onNotForSale} />
          </ScrollView>
        ) : left.length === 0 ? (
          <View style={styles.emptyBox} testID="myroom-decor-owned-empty">
            {counts.room != null && <Summary room={counts.room} storage={0} />}
            {/* Never an offer to buy while pieces are not sold (stage 1): only how to fill it. */}
            <Text style={styles.empty}>{t(furnitureForSale ? 'myroom.tray.empty' : 'myroom.tray.emptyNoShop')}</Text>
            {furnitureForSale && (
              <Pressable testID="myroom-decor-to-shop" accessibilityRole="link" onPress={() => pick('shop')} hitSlop={8}>
                <Text style={styles.link}>{t('myroom.tray.toShop')}</Text>
              </Pressable>
            )}
          </View>
        ) : expanded ? (
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} testID="myroom-decor-owned">
            {counts.room != null && <Summary room={counts.room} storage={counts.storage} />}
            {groups.map(g => (
              <View key={g.section} testID={`myroom-owned-section-${g.section}`}>
                <Text style={styles.sectionHead}>{t(SECTION_LABEL[g.section])}</Text>
                {g.items.map(([id, n]) => <OwnedRow key={id} id={id} n={n} category={categoryOf(id)} onAdd={onAdd} />)}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View>
            {counts.room != null && <Summary room={counts.room} storage={counts.storage} />}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="myroom-decor-owned">
              {groups.map((g, gi) => (
                // One strip, grouped: a small label over each group, a hairline between groups.
                <View key={g.section} style={[styles.stripGroup, gi > 0 && styles.stripGroupNext]} testID={`myroom-owned-section-${g.section}`}>
                  <Text style={styles.stripLabel} numberOfLines={1}>{t(SECTION_LABEL[g.section])}</Text>
                  <View style={styles.stripCards}>
                    {g.items.map(([id, n]) => <OwnedCard key={id} id={id} n={n} category={categoryOf(id)} onAdd={onAdd} />)}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};

/** "In the room: 25 · In storage: 1" — one line over the storage list. */
const Summary: React.FC<{ room: number; storage: number }> = ({ room, storage }) => {
  const t = useT();
  return (
    <Text style={styles.summary} numberOfLines={1} testID="myroom-decor-summary">
      {t('myroom.tray.summary', { room, storage })}
    </Text>
  );
};

/** A skin: the room in it (16:10; its swatch until there is a render), its name, and Owned or its
 *  price. The one the room wears is ringed in gold. */
const SkinCard: React.FC<{ skin: Skin; current: boolean; onPress(): void }> = ({ skin, current, onPress }) => {
  const t = useT();
  const name = themeName(t, skin.id);
  return (
    <Pressable
      testID={`myroom-skin-${skin.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${name} · ${skin.owned ? t('myroom.decor.ownedTheme') : formatCoins(skin.price)}`}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, current && styles.cardOn, pressed && styles.pressed]}>
      <SkinThumb id={skin.id} width={CARD_INNER} testID={`myroom-skin-thumb-${skin.id}`} />
      <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
      {/* One status only: "In use" already says owned, and both side by side ran into the next card (14-10). */}
      <View style={styles.cardFoot}>
        {current ? (
          <Text style={styles.add} numberOfLines={1}>{t('myroom.skin.current')}</Text>
        ) : skin.owned ? (
          <Text style={styles.count} numberOfLines={1}>{t('myroom.decor.ownedTheme')}</Text>
        ) : skin.price != null ? (
          <View style={styles.price}>
            <CoinGlyph size={12} />
            <Text style={styles.count}>{formatCoins(skin.price)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

/** A stored piece: its picture, its name, how many copies, and Place in room. */
const OwnedCard: React.FC<{ id: string; n: number; category?: string; onAdd(item: string): void }> = ({ id, n, category, onAdd }) => {
  const t = useT();
  return (
    <Pressable
      testID={`myroom-owned-${id}`}
      accessibilityRole="button"
      accessibilityLabel={`${itemName(t, id)} · ${t('myroom.edit.add')}`}
      onPress={() => onAdd(id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <ItemThumb id={id} category={category} size={64} style={styles.cardThumb} testID={`myroom-owned-thumb-${id}`} />
      {/* Name and count on one line, the action on its own (sim QA run4: "×1Place in room" ran
          together when both shared a line in a 116 pt card). */}
      <View style={styles.cardFoot}>
        <Text style={[styles.cardName, styles.grow]} numberOfLines={1}>{itemName(t, id)}</Text>
        <Text style={styles.count} testID={`myroom-owned-count-${id}`}>{`×${n}`}</Text>
      </View>
      <View style={styles.cardAction}>
        <Text style={styles.cardActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('myroom.edit.add')}</Text>
      </View>
    </Pressable>
  );
};

const OwnedRow: React.FC<{ id: string; n: number; category?: string; onAdd(item: string): void }> = ({ id, n, category, onAdd }) => {
  const t = useT();
  return (
    <Pressable
      testID={`myroom-owned-${id}`}
      accessibilityRole="button"
      accessibilityLabel={`${itemName(t, id)} · ${t('myroom.edit.add')}`}
      onPress={() => onAdd(id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ItemThumb id={id} category={category} size={40} />
      <Text style={styles.rowName}>{itemName(t, id)}</Text>
      <Text style={styles.count} testID={`myroom-owned-count-${id}`}>{`×${n}`}</Text>
      <Text style={styles.add}>{t('myroom.edit.add')}</Text>
    </Pressable>
  );
};

const PANEL = 'rgba(14,12,40,0.94)';
/** Card width: three and a bit show on an iPhone 17 (402 pt) — the strip reads as one you scroll. */
const CARD_W = 116;
const CARD_INNER = CARD_W - 2 * spacing.sm - 2;
const HAIRLINE = 'rgba(233,196,106,0.45)';

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  selection: {
    backgroundColor: PANEL, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    borderTopWidth: 1, borderColor: HAIRLINE,
  },
  tray: { backgroundColor: PANEL, borderTopWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  handleHit: { alignItems: 'center', paddingVertical: spacing.xs },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(233,196,106,0.55)' },
  titleRow: { paddingTop: spacing.sm },
  trayTitle: { ...typography.bodyStrong, color: colors.gold },
  tabsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tabsScroll: { flexShrink: 1, flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: spacing.xs },
  tab: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  tabOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  tabTextOn: { color: '#1A1330' },
  // Shrinks to fit the tray's cap; grows no further than its content.
  body: { flexGrow: 0, flexShrink: 1 },
  bodyInner: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  strip: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  card: {
    width: CARD_W, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 2, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  cardOn: { borderColor: colors.gold, borderWidth: 2 },
  cardThumb: { alignSelf: 'center' },
  stripGroup: { gap: 2 },
  stripGroupNext: { paddingLeft: spacing.sm, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.45)' },
  stripLabel: { ...typography.tiny, color: colors.gold, fontWeight: '700' },
  stripCards: { flexDirection: 'row', gap: spacing.sm },
  sectionHead: { ...typography.caption, color: colors.gold, fontWeight: '700', marginTop: spacing.sm },
  price: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardName: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  cardAction: {
    marginTop: 2, alignItems: 'center', paddingVertical: 2, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)',
  },
  cardActionText: { ...typography.tiny, color: colors.gold, fontWeight: '700' },
  grow: { flex: 1 },
  emptyBox: { alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  summary: { ...typography.tiny, color: colors.textSecondary, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  link: { ...typography.caption, color: colors.gold, fontWeight: '700', textDecorationLine: 'underline', paddingTop: spacing.xs },
  empty: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  rowName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  count: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  add: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
