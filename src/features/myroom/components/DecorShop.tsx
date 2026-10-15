import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useCoins } from '../../coins/store/coinStore';
import { buyMyRoomSku, fetchMyRoomCatalog, purchaseKeyFor, type CatalogItem, type CatalogTheme } from '../api/myRoomApi';
import { useMyRoomStore } from '../store/myRoomStore';
import { itemName, themeName } from '../names';
import { CoinGlyph } from '../../coins/components/CoinGlyph';
import { formatCoins } from '../../coins/format';
import { ALL_ORIENTATIONS } from '../../coins/components/CoinShopSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TranslationKey } from '../../../shared/i18n';
import { ItemThumb, SkinThumb } from './ItemThumb';
import { SECTION_LABEL, bySection } from '../sections';

/**
 * 상점 — the decorate tray's Shop tab (spec 005 US3): the catalog with prices (GET
 * prayers/myroom/catalog); Buy spends coins through POST prayers/myroom/purchase, asking once
 * before coins move. Short of coins → the app's coin shop. A bought copy goes into myRoomStore's
 * `owned` at once, so the tray's Owned tab shows it without a reload. A piece this build has no
 * name for is left out (spec 005 edge case).
 *
 * Each row leads with the piece's picture (Unity's render, 14-10: "ở đây không có preview hả?"). A
 * tap on the row — not on its price — opens a preview: the picture large, size and category, what
 * the account has, and Buy (the same purchase path: one key per intent, 402 → coin shop, 409s).
 */
export const DecorShop: React.FC<{ onNotForSale?(): void }> = ({ onNotForSale }) => {
  const t = useT();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [themes, setThemes] = useState<CatalogTheme[]>([]);
  const [failed, setFailed] = useState(false);
  // One row at a time asks "buy?" before coins move; the key is that row's purchase.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  // The in-flight guard is a ref, not `buying`: two taps inside one frame both read the same stale
  // state and would send two purchases. The ref is set before the first await.
  const inFlight = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  const balance = useCoins(s => s.balance);
  // The row whose preview sheet is open (by sku).
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setFailed(false);
    fetchMyRoomCatalog(signal).then(cat => {
      if (signal?.aborted) return;
      if (!cat) { setFailed(true); return; }
      setItems(cat.items);
      setThemes(cat.themes);
    });
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  /** Owned changed under us (409): read it again, and the catalog's counts with it. */
  const reloadOwned = () => {
    useMyRoomStore.getState().refresh();
    load();
  };

  /** The row's price button: asks once ("Buy?"), then spends. */
  const buy = (sku: string, name: string, price: number) => {
    if (inFlight.current) return;
    if (balance != null && balance < price) {
      sfx.tap();
      useCoins.getState().openShop();
      return;
    }
    if (confirming !== sku) { sfx.tap(); setConfirming(sku); setNote(null); return; }
    return purchase(sku, name, price);
  };

  /** Spend. The preview sheet's Buy comes straight here: the sheet itself was the "are you sure". */
  const purchase = async (sku: string, name: string, price: number) => {
    if (inFlight.current) return;
    // The wallet as of now, not as of the last render: a top-up or a spend may have landed since.
    const wallet = useCoins.getState().balance;
    if (wallet != null && wallet < price) {
      sfx.tap();
      // The coin shop is a Modal too: the preview goes first, or iOS would not present it.
      setPreview(null);
      useCoins.getState().openShop();
      return;
    }
    sfx.select();
    inFlight.current = true;
    setConfirming(null);
    setBuying(sku);
    // One key per intent: a retry of a buy that never got an answer reuses it (myRoomApi).
    const r = await buyMyRoomSku(sku, purchaseKeyFor(sku)).finally(() => { inFlight.current = false; });
    setBuying(null);
    if (r.ok) {
      useMyRoomStore.getState().setOwned(r.owned);
      setItems(list => list?.map(i => (`item:${i.id}` === sku ? { ...i, owned: r.owned.items[i.id] ?? i.owned } : i)) ?? list);
      setThemes(list => list.map(th => (`theme:${th.id}` === sku ? { ...th, owned: true } : th)));
      setNote(t('myroom.decor.bought', { name }));
    } else if (r.kind === 'insufficient') {
      setPreview(null);
      useCoins.getState().openShop();
    } else if (r.kind === 'owned' || r.kind === 'keyReused') {
      setNote(t(r.kind === 'owned' ? 'myroom.decor.alreadyOwned' : 'myroom.decor.keyReused'));
      reloadOwned();
    } else if (r.kind === 'notForSale') {
      // A stale catalog: the server stopped selling pieces. Say so here, and let the tray re-read it
      // (its Shop tab goes when the catalog says so).
      setPreview(null);
      setNote(t('myroom.decor.notForSale'));
      load();
      onNotForSale?.();
    } else {
      setNote(t('myroom.decor.failed'));
    }
  };

  // Only what can be bought now: a piece listed for Storage and Swap but `buyable: false` is not a Shop row.
  const shopItems = (items ?? []).filter(i => i.buyable && itemName(t, i.id) !== '');
  const shopThemes = themes.filter(th => !th.starter && themeName(t, th.id) !== '');
  const loading = items == null && !failed;

  return (
    <View testID="myroom-decor-shop">
      {note && <Text style={styles.note} testID="myroom-decor-note">{note}</Text>}
      {loading && <ActivityIndicator color={colors.gold} style={styles.loading} />}
      {failed && (
        <Pressable onPress={() => { sfx.tap(); load(); }} accessibilityRole="button" testID="myroom-decor-retry">
          <Text style={styles.empty}>{t('myroom.decor.offline')}</Text>
          <Text style={styles.retry}>{t('myroom.retry')}</Text>
        </Pressable>
      )}
      {!loading && !failed && (
        <>
          {bySection(shopItems, i => i.category).map(g => (
            <View key={g.section} testID={`myroom-shop-section-${g.section}`}>
              <Text style={styles.section}>{t(SECTION_LABEL[g.section])}</Text>
              {g.items.map(i => (
                <ShopRow
                  key={i.id}
                  sku={`item:${i.id}`}
                  thumb={<ItemThumb id={i.id} category={i.category} size={56} testID={`myroom-shop-thumb-${i.id}`} />}
                  onOpen={() => { sfx.tap(); setPreview(`item:${i.id}`); }}
                  name={itemName(t, i.id)}
                  sub={i.owned > 0 ? t('myroom.decor.have', { count: i.owned }) : ''}
                  price={i.price}
                  confirming={confirming === `item:${i.id}`}
                  busy={buying === `item:${i.id}`}
                  short={balance != null && balance < i.price}
                  onBuy={buy}
                />
              ))}
            </View>
          ))}
          {shopThemes.length > 0 && <Text style={styles.section}>{t('myroom.decor.themes')}</Text>}
          {shopThemes.map(th => (
            th.owned ? (
              <View key={th.id} style={styles.row} testID={`myroom-shop-theme:${th.id}`}>
                <SkinThumb id={th.id} width={56} />
                <Text style={[styles.rowName, styles.grow]}>{themeName(t, th.id)}</Text>
                <Text style={styles.count}>{t('myroom.decor.ownedTheme')}</Text>
              </View>
            ) : (
              <ShopRow
                key={th.id}
                sku={`theme:${th.id}`}
                thumb={<SkinThumb id={th.id} width={56} />}
                onOpen={() => { sfx.tap(); setPreview(`theme:${th.id}`); }}
                name={themeName(t, th.id)}
                sub=""
                price={th.price}
                confirming={confirming === `theme:${th.id}`}
                busy={buying === `theme:${th.id}`}
                short={balance != null && balance < th.price}
                onBuy={buy}
              />
            )
          ))}
        </>
      )}
      {preview && (() => {
        const [kind, id] = preview.split(':') as ['item' | 'theme', string];
        const item = kind === 'item' ? items?.find(i => i.id === id) : undefined;
        const theme = kind === 'theme' ? themes.find(th => th.id === id) : undefined;
        if (!item && !theme) return null;
        const name = item ? itemName(t, id) : themeName(t, id);
        const price = (item ?? theme)!.price;
        return (
          <PreviewSheet
            sku={preview}
            name={name}
            picture={item ? <ItemThumb id={id} category={item.category} size={200} testID="myroom-preview-thumb" /> : <SkinThumb id={id} width={260} testID="myroom-preview-thumb" />}
            facts={item ? [sizeLabel(t, item.size), categoryLabel(t, item.category)].filter(Boolean).join(' · ') : ''}
            have={item ? t('myroom.decor.have', { count: item.owned }) : theme!.owned ? t('myroom.decor.ownedTheme') : ''}
            price={price}
            canBuy={!(theme && theme.owned)}
            busy={buying === preview}
            note={note}
            onBuy={() => purchase(preview, name, price)}
            onClose={() => { sfx.back(); setPreview(null); }}
          />
        );
      })()}
    </View>
  );
};

/** A catalog size or category in words; '' for one this build has no word for. */
const sizeLabel = (t: (k: TranslationKey) => string, size: string) => {
  const k = `myroom.size.${size}` as TranslationKey;
  const v = t(k);
  return v === k ? '' : v;
};
const categoryLabel = (t: (k: TranslationKey) => string, category: string) => {
  const k = `myroom.category.${category}` as TranslationKey;
  const v = t(k);
  return v === k ? '' : v;
};

/** The preview: a sheet from the bottom over the room, its picture large. */
const PreviewSheet: React.FC<{
  sku: string;
  name: string;
  picture: React.ReactNode;
  facts: string;
  have: string;
  price: number;
  canBuy: boolean;
  busy: boolean;
  note: string | null;
  onBuy(): void;
  onClose(): void;
}> = ({ sku, name, picture, facts, have, price, canBuy, busy, note, onBuy, onClose }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} supportedOrientations={[...ALL_ORIENTATIONS]}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('coins.close')} />
        <View style={[styles.sheet, { paddingBottom: safe.bottom + spacing.lg }]} testID={`myroom-preview-${sku}`}>
          <Pressable style={styles.close} hitSlop={12} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('coins.close')} testID="myroom-preview-close">
            <Icon name="close" size={22} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.picture}>{picture}</View>
          <Text style={styles.previewName}>{name}</Text>
          {!!facts && <Text style={styles.previewFacts}>{facts}</Text>}
          {!!have && <Text style={styles.previewFacts}>{have}</Text>}
          {note && <Text style={styles.note}>{note}</Text>}
          {canBuy && (
            <Pressable
              testID="myroom-preview-buy"
              accessibilityRole="button"
              accessibilityLabel={`${t('myroom.skin.buy')} · ${formatCoins(price)}`}
              disabled={busy}
              onPress={onBuy}
              style={({ pressed }) => [styles.previewBuy, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator size="small" color="#1A1330" /> : (
                <>
                  <Text style={styles.previewBuyText}>{t('myroom.skin.buy')}</Text>
                  <CoinGlyph size={16} />
                  <Text style={styles.previewBuyText}>{formatCoins(price)}</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const ShopRow: React.FC<{
  sku: string;
  thumb: React.ReactNode;
  /** A tap on the row (not the price): the preview sheet. */
  onOpen(): void;
  name: string;
  sub: string;
  price: number;
  confirming: boolean;
  busy: boolean;
  /** Not enough coins: the button opens the coin shop instead. */
  short: boolean;
  onBuy(sku: string, name: string, price: number): void;
}> = ({ sku, thumb, onOpen, name, sub, price, confirming, busy, short, onBuy }) => {
  const t = useT();
  const label = confirming ? t('myroom.decor.confirm') : formatCoins(price);
  return (
    <View style={styles.row} testID={`myroom-shop-${sku}`}>
      <Pressable
        testID={`myroom-shop-open-${sku}`}
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowOpen, pressed && styles.pressed]}>
        {thumb}
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{name}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
      </Pressable>
      <Pressable
        testID={`myroom-buy-${sku}`}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={short ? `${name} · ${t('myroom.decor.short')}` : `${name} · ${label}`}
        onPress={() => onBuy(sku, name, price)}
        style={({ pressed }) => [styles.buy, confirming && styles.buyConfirm, short && styles.buyShort, pressed && styles.pressed]}>
        {busy ? (
          <ActivityIndicator size="small" color="#1A1330" />
        ) : (
          <>
            {!confirming && <CoinGlyph size={16} />}
            <Text style={[styles.buyText, confirming && styles.buyTextConfirm]}>{label}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  note: { ...typography.caption, color: colors.gold, marginBottom: spacing.xs },
  loading: { marginVertical: spacing.lg },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingTop: spacing.lg },
  retry: { ...typography.caption, color: colors.gold, textAlign: 'center', paddingVertical: spacing.sm },
  section: { ...typography.bodyStrong, color: colors.gold, marginTop: spacing.md, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  rowBody: { flex: 1, gap: 2 },
  rowOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,20,0.55)' },
  sheet: {
    alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
    backgroundColor: 'rgba(14,12,40,0.98)', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    borderTopWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  close: { position: 'absolute', right: spacing.lg, top: spacing.md, zIndex: 1 },
  picture: { paddingVertical: spacing.sm },
  previewName: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  previewFacts: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  previewBuy: {
    marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  previewBuyText: { ...typography.bodyStrong, color: '#1A1330' },
  rowName: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  rowSub: { ...typography.tiny, color: colors.textMuted },
  count: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  buy: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 72, justifyContent: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  buyConfirm: { backgroundColor: colors.gold, borderColor: colors.gold },
  buyShort: { opacity: 0.6 },
  buyText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  buyTextConfirm: { color: '#1A1330' },
  pressed: { opacity: 0.75 },
});
