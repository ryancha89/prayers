import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { WorldSheet } from '../../world/components/WorldSheets';
import { CoinPill } from '../../coins/components/CoinPill';
import { useCoins } from '../../coins/store/coinStore';
import {
  buyMyRoomSku, fetchMyRoomCatalog, fetchMyRoomOwned, newIdemKey,
  type CatalogItem, type CatalogTheme, type Owned,
} from '../api/myRoomApi';
import { itemName, themeName } from '../names';

export type DecorTab = 'owned' | 'shop';

/**
 * 편집 — the decorate sheet (spec 005 US2/US3), the RN half that the server already supports:
 *
 *   보유 (Owned) what the account has, copies per piece (GET prayers/myroom `owned`)
 *   상점 (Shop)  the catalog with prices (GET prayers/myroom/catalog); Buy spends coins through
 *                POST prayers/myroom/purchase. Short of coins → the app's coin shop.
 *
 * Placing and moving the pieces is Unity's decorate mode (MYROOM_EDIT…), which is not built: the
 * owned list says so plainly instead of offering a mover that does nothing. A piece this build has
 * no name for is left out (spec 005 edge case), as the server expects.
 */
export const DecorateSheet: React.FC<{ initialTab?: DecorTab; onClose(): void }> = ({ initialTab = 'owned', onClose }) => {
  const t = useT();
  const [tab, setTab] = useState<DecorTab>(initialTab);
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [themes, setThemes] = useState<CatalogTheme[]>([]);
  const [owned, setOwned] = useState<Owned | null>(null);
  const [failed, setFailed] = useState(false);
  // One row at a time asks "buy?" before coins move; the key is that row's purchase.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const balance = useCoins(s => s.balance);

  const load = useCallback((signal?: AbortSignal) => {
    setFailed(false);
    Promise.all([fetchMyRoomCatalog(signal), fetchMyRoomOwned(signal)]).then(([cat, own]) => {
      if (signal?.aborted) return;
      if (!cat && !own) { setFailed(true); return; }
      if (cat) { setItems(cat.items); setThemes(cat.themes); } else setItems([]);
      // The catalog's own counts stand in when GET myroom did not answer.
      setOwned(own ?? (cat ? {
        items: Object.fromEntries(cat.items.filter(i => i.owned > 0).map(i => [i.id, i.owned])),
        themes: cat.themes.filter(th => th.owned).map(th => th.id),
      } : null));
    });
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const buy = async (sku: string, name: string, price: number) => {
    if (buying) return;
    if (balance != null && balance < price) {
      sfx.tap();
      useCoins.getState().openShop();
      return;
    }
    if (confirming !== sku) { sfx.tap(); setConfirming(sku); setNote(null); return; }
    sfx.select();
    setConfirming(null);
    setBuying(sku);
    const r = await buyMyRoomSku(sku, newIdemKey());
    setBuying(null);
    if (r.ok) {
      setOwned(r.owned);
      setItems(list => list?.map(i => (`item:${i.id}` === sku ? { ...i, owned: r.owned.items[i.id] ?? i.owned } : i)) ?? list);
      setThemes(list => list.map(th => (`theme:${th.id}` === sku ? { ...th, owned: true } : th)));
      setNote(t('myroom.decor.bought', { name }));
    } else if (r.reason === 'insufficient') {
      useCoins.getState().openShop();
    } else if (r.reason === 'owned') {
      setNote(t('myroom.decor.ownedTheme'));
    } else {
      setNote(t('myroom.decor.failed'));
    }
  };

  const shopItems = (items ?? []).filter(i => itemName(t, i.id) !== '');
  const shopThemes = themes.filter(th => !th.starter && themeName(t, th.id) !== '');
  const ownedItems = owned ? Object.entries(owned.items).filter(([id, n]) => n > 0 && itemName(t, id) !== '') : [];
  const ownedThemes = owned ? owned.themes.filter(id => themeName(t, id) !== '') : [];
  const loading = items == null && !failed;

  return (
    <WorldSheet title={t('myroom.decor.title')} onClose={onClose} testID="myroom-sheet-decor">
      <View style={styles.tabsRow}>
        <View style={styles.tabs}>
          {(['owned', 'shop'] as const).map(k => (
            <Pressable
              key={k}
              testID={`myroom-decor-tab-${k}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              accessibilityLabel={t(k === 'owned' ? 'myroom.decor.owned' : 'myroom.decor.shop')}
              onPress={() => { sfx.tap(); setTab(k); setConfirming(null); }}
              style={[styles.tab, tab === k && styles.tabOn]}>
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
                {t(k === 'owned' ? 'myroom.decor.owned' : 'myroom.decor.shop')}
              </Text>
            </Pressable>
          ))}
        </View>
        <CoinPill />
      </View>

      {note && <Text style={styles.note} testID="myroom-decor-note">{note}</Text>}
      {loading && <ActivityIndicator color={colors.gold} style={styles.loading} />}
      {failed && (
        <Pressable onPress={() => { sfx.tap(); load(); }} accessibilityRole="button" testID="myroom-decor-retry">
          <Text style={styles.empty}>{t('myroom.decor.offline')}</Text>
          <Text style={styles.retry}>{t('myroom.retry')}</Text>
        </Pressable>
      )}

      {!loading && !failed && tab === 'owned' && (
        <View testID="myroom-decor-owned">
          <View style={styles.soon} testID="myroom-decor-arrange-soon">
            <Icon name="armchair" size={18} color={colors.gold} />
            <Text style={styles.soonText}>{t('myroom.decor.arrangeSoon')}</Text>
          </View>
          {ownedItems.map(([id, n]) => (
            <View key={id} style={styles.row} testID={`myroom-owned-${id}`}>
              <Text style={styles.rowName}>{itemName(t, id)}</Text>
              <Text style={styles.count}>{`×${n}`}</Text>
            </View>
          ))}
          {ownedThemes.length > 0 && <Text style={styles.section}>{t('myroom.decor.themes')}</Text>}
          {ownedThemes.map(id => (
            <View key={id} style={styles.row} testID={`myroom-owned-theme-${id}`}>
              <Text style={styles.rowName}>{themeName(t, id)}</Text>
              <Text style={styles.count}>{t('myroom.decor.ownedTheme')}</Text>
            </View>
          ))}
        </View>
      )}

      {!loading && !failed && tab === 'shop' && (
        <View testID="myroom-decor-shop">
          <Text style={styles.section}>{t('myroom.decor.items')}</Text>
          {shopItems.map(i => (
            <ShopRow
              key={i.id}
              sku={`item:${i.id}`}
              name={itemName(t, i.id)}
              sub={i.owned > 0 ? t('myroom.decor.have', { count: i.owned }) : ''}
              price={i.price}
              confirming={confirming === `item:${i.id}`}
              busy={buying === `item:${i.id}`}
              short={balance != null && balance < i.price}
              onBuy={buy}
            />
          ))}
          {shopThemes.length > 0 && <Text style={styles.section}>{t('myroom.decor.themes')}</Text>}
          {shopThemes.map(th => (
            th.owned ? (
              <View key={th.id} style={styles.row} testID={`myroom-shop-theme:${th.id}`}>
                <Text style={styles.rowName}>{themeName(t, th.id)}</Text>
                <Text style={styles.count}>{t('myroom.decor.ownedTheme')}</Text>
              </View>
            ) : (
              <ShopRow
                key={th.id}
                sku={`theme:${th.id}`}
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
        </View>
      )}
    </WorldSheet>
  );
};

const ShopRow: React.FC<{
  sku: string;
  name: string;
  sub: string;
  price: number;
  confirming: boolean;
  busy: boolean;
  /** Not enough coins: the button opens the coin shop instead. */
  short: boolean;
  onBuy(sku: string, name: string, price: number): void;
}> = ({ sku, name, sub, price, confirming, busy, short, onBuy }) => {
  const t = useT();
  const label = confirming ? t('myroom.decor.confirm') : `${price}`;
  return (
    <View style={styles.row} testID={`myroom-shop-${sku}`}>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{name}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
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
            {!confirming && <Icon name="coin" size={14} color={colors.gold} />}
            <Text style={[styles.buyText, confirming && styles.buyTextConfirm]}>{label}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  tabsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.xs },
  tab: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  tabOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  tabTextOn: { color: '#1A1330' },
  note: { ...typography.caption, color: colors.gold, marginBottom: spacing.xs },
  loading: { marginVertical: spacing.lg },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingTop: spacing.lg },
  retry: { ...typography.caption, color: colors.gold, textAlign: 'center', paddingVertical: spacing.sm },
  soon: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(233,196,106,0.08)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  soonText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  section: { ...typography.bodyStrong, color: colors.gold, marginTop: spacing.md, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  rowBody: { flex: 1, gap: 2 },
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
