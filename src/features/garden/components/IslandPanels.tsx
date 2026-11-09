import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { SERIF } from '../../../shared/components/hud/Hud';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import type { Element, Garden, GardenCatalog, GardenPlot } from '../api/gardenApi';
import { ELEMENTS, biomeKey, decorForSale, decorKey, ownsEffect, packets, plantablePlots, seedKey, seedsForSale } from '../island';
import { GARDEN, GardenButton } from './GardenChrome';

/**
 * Tree of Mind phase 2's sheets (TreeOfMind-Growth.html §3.3–3.5): a plot's terms and its biome picker,
 * the Gold shop (seeds, decor, the land) with the plant flow, and decor edit mode's bar. Every price and
 * level shown is the server's; the screen does the calls.
 */

export const GardenPanel: React.FC<{ title: string; onClose: () => void; maxHeight: number; testID?: string; children: React.ReactNode }> = ({
  title, onClose, maxHeight, testID, children,
}) => {
  const t = useT();
  return (
    <View style={[styles.panel, { maxHeight }]} testID={testID}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle} numberOfLines={1}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('garden.shop.close')} onPress={() => { sfx.back(); onClose(); }} hitSlop={10} testID="garden-panel-close">
          <Icon name="close" size={18} color={GARDEN.dew} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.panelBody}>{children}</ScrollView>
    </View>
  );
};

const Row: React.FC<{ title: string; note?: string; locked?: boolean; action?: React.ReactNode; testID?: string }> = ({ title, note, locked, action, testID }) => (
  <View style={[styles.row, locked && styles.rowLocked]} testID={testID}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      {note ? <Text style={styles.rowNote} numberOfLines={2}>{note}</Text> : null}
    </View>
    {action}
  </View>
);

const Small: React.FC<{ label: string; onPress: () => void; disabled?: boolean; testID?: string; quiet?: boolean }> = ({ label, onPress, disabled, testID, quiet }) => (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.small, quiet && styles.smallQuiet, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.smallText, quiet && styles.smallTextQuiet]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

/** One plot: locked (the level it needs), buyable (price + biome picker), or owned (its biome and seeds). */
export const PlotPanel: React.FC<{
  plot: GardenPlot;
  garden: Garden;
  catalog: GardenCatalog;
  busy: boolean;
  error: string | null;
  maxHeight: number;
  onBuy: (element: Element) => void;
  onPlant: () => void;
  onClose: () => void;
}> = ({ plot, garden, catalog, busy, error, maxHeight, onBuy, onPlant, onClose }) => {
  const t = useT();
  const [pick, setPick] = React.useState<Element>('water');
  const growing = garden.seeds.filter(s => s.status === 'growing' && s.plot === plot.index).length;
  return (
    <GardenPanel title={t('garden.plot.title', { n: plot.index })} onClose={onClose} maxHeight={maxHeight} testID="garden-plot-panel">
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {plot.owned && plot.element ? (
        <>
          <Text style={styles.line}>{t(biomeKey(plot.element))}</Text>
          <Text style={styles.note}>{t('garden.plot.seeds', { n: growing, max: catalog.seedsPerPlot })}</Text>
          <Text style={styles.note}>{t('garden.plot.bonus', { n: catalog.matchBonusPercent })}</Text>
          {growing < catalog.seedsPerPlot && packets(garden).length > 0 ? (
            <GardenButton testID="garden-plot-plant" label={t('garden.plot.plant')} onPress={onPlant} quiet />
          ) : null}
        </>
      ) : !plot.unlocked ? (
        <Text style={styles.line} testID="garden-plot-locked">{t('garden.plot.locked', { level: plot.level })}</Text>
      ) : (
        <>
          <Text style={styles.note}>{t('garden.plot.pick')}</Text>
          <View style={styles.biomes}>
            {ELEMENTS.map(e => (
              <Pressable
                key={e}
                testID={`garden-biome-${e}`}
                accessibilityRole="button"
                accessibilityState={{ selected: pick === e }}
                accessibilityLabel={t(biomeKey(e))}
                onPress={() => { sfx.tap(); setPick(e); }}
                style={[styles.biome, pick === e && styles.biomeOn]}>
                <Text style={[styles.biomeText, pick === e && styles.biomeTextOn]} numberOfLines={2}>{t(biomeKey(e))}</Text>
              </Pressable>
            ))}
          </View>
          <GardenButton testID="garden-plot-buy" label={t('garden.plot.buy', { price: plot.price })} onPress={() => onBuy(pick)} disabled={busy} />
        </>
      )}
    </GardenPanel>
  );
};

export type ShopTab = 'seeds' | 'decor' | 'land';

/** The Gold shop: seeds (and the packets waiting to be planted), decor, and the land (every plot). */
export const ShopPanel: React.FC<{
  tab: ShopTab;
  garden: Garden;
  catalog: GardenCatalog;
  ownedDecor: Record<string, number>;
  effects: { orb: string | null; music: string | null };
  plantingSeed: number | null;
  busy: boolean;
  error: string | null;
  maxHeight: number;
  onTab: (tab: ShopTab) => void;
  onBuySeed: (id: string) => void;
  onBuyDecor: (id: string) => void;
  onUseEffect: (kind: 'orb' | 'music', id: string | null) => void;
  onPlantPick: (seedId: number | null) => void;
  onPlant: (seedId: number, plot: number) => void;
  onPlot: (index: number) => void;
  onClose: () => void;
}> = p => {
  const t = useT();
  const g = p.garden;
  const tabs: ShopTab[] = ['seeds', 'decor', 'land'];
  const tabLabel = (tab: ShopTab) => t(tab === 'seeds' ? 'garden.shop.seeds' : tab === 'decor' ? 'garden.shop.decor' : 'garden.shop.land');
  const plots = plantablePlots(g, p.catalog.seedsPerPlot);
  return (
    <GardenPanel title={t('garden.shop')} onClose={p.onClose} maxHeight={p.maxHeight} testID="garden-shop">
      <View style={styles.tabs}>
        {tabs.map(tab => (
          <Pressable key={tab} testID={`garden-shop-tab-${tab}`} accessibilityRole="tab" accessibilityState={{ selected: p.tab === tab }}
            onPress={() => { sfx.tap(); p.onTab(tab); }} style={[styles.tab, p.tab === tab && styles.tabOn]}>
            <Text style={[styles.tabText, p.tab === tab && styles.tabTextOn]} numberOfLines={1}>{tabLabel(tab)}</Text>
          </Pressable>
        ))}
      </View>
      {p.error ? <Text style={styles.error} testID="garden-shop-error">{p.error}</Text> : null}

      {p.tab === 'seeds' && (
        <>
          {packets(g).length > 0 && <Text style={styles.section}>{t('garden.shop.packets')}</Text>}
          {packets(g).map(seed => (
            <View key={seed.id}>
              <Row
                testID={`garden-packet-${seed.id}`}
                title={t(seedKey(seed.species))}
                note={t('garden.shop.energyNeed', { n: seed.need })}
                action={<Small testID={`garden-packet-plant-${seed.id}`} label={t('garden.shop.plant')} onPress={() => p.onPlantPick(p.plantingSeed === seed.id ? null : seed.id)} />}
              />
              {p.plantingSeed === seed.id && (
                <View style={styles.plotPick}>
                  {plots.length === 0 ? <Text style={styles.note}>{t('garden.shop.noPlot')}</Text> : <Text style={styles.note}>{t('garden.shop.choosePlot')}</Text>}
                  <View style={styles.biomes}>
                    {plots.map(pl => (
                      <Small key={pl.index} testID={`garden-plant-plot-${pl.index}`} quiet disabled={p.busy}
                        label={`${t('garden.plot.title', { n: pl.index })}${pl.element ? ` · ${t(biomeKey(pl.element))}` : ''}`}
                        onPress={() => p.onPlant(seed.id, pl.index)} />
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
          <Text style={styles.section}>{t('garden.shop.seeds')}</Text>
          {seedsForSale(p.catalog, g.level).map(({ spec, open }) => (
            <Row
              key={spec.id}
              testID={`garden-seed-${spec.id}`}
              locked={!open}
              title={`${t(seedKey(spec.id))} · ${t(`garden.element.${spec.element}` as never)}`}
              note={open ? t('garden.shop.energyNeed', { n: spec.energy }) : t('garden.shop.opensAt', { level: spec.level })}
              action={open ? <Small testID={`garden-seed-buy-${spec.id}`} label={t('garden.shop.buy', { price: spec.price })} onPress={() => p.onBuySeed(spec.id)} disabled={p.busy} /> : null}
            />
          ))}
        </>
      )}

      {p.tab === 'decor' && decorForSale(p.catalog, g.level).map(({ spec, open }) => {
        const owned = p.ownedDecor[spec.id] ?? 0;
        const effect = spec.kind === 'orb' || spec.kind === 'music' ? spec.kind : null;
        const inUse = effect ? p.effects[effect] === spec.id : false;
        let action: React.ReactNode = null;
        if (!open) action = null;
        else if (effect && ownsEffect(p.ownedDecor, spec.id)) {
          action = <Small testID={`garden-decor-use-${spec.id}`} quiet label={t(inUse ? 'garden.shop.inUse' : 'garden.shop.use')} disabled={p.busy}
            onPress={() => p.onUseEffect(effect, inUse ? null : spec.id)} />;
        } else action = <Small testID={`garden-decor-buy-${spec.id}`} label={t('garden.shop.buy', { price: spec.price })} onPress={() => p.onBuyDecor(spec.id)} disabled={p.busy} />;
        return (
          <Row key={spec.id} testID={`garden-decor-${spec.id}`} locked={!open} title={t(decorKey(spec.id))}
            note={!open ? t('garden.shop.opensAt', { level: spec.level }) : owned > 0 && !effect ? t('garden.shop.owned', { n: owned }) : undefined}
            action={action} />
        );
      })}

      {p.tab === 'land' && g.plots.map(pl => (
        <Row key={pl.index} testID={`garden-land-${pl.index}`} locked={!pl.unlocked && !pl.owned}
          title={`${t('garden.plot.title', { n: pl.index })}${pl.owned && pl.element ? ` · ${t(biomeKey(pl.element))}` : ''}`}
          note={pl.owned ? undefined : pl.unlocked ? t('garden.shop.buy', { price: pl.price }) : t('garden.plot.locked', { level: pl.level })}
          action={<Small testID={`garden-land-open-${pl.index}`} quiet label={t('garden.plot.title', { n: pl.index })} onPress={() => p.onPlot(pl.index)} />} />
      ))}
    </GardenPanel>
  );
};

/** Decor edit mode: what is left to place, the selected piece's tools, Done / Cancel. */
export const DecorateBar: React.FC<{
  left: Record<string, number>;
  selected: string;
  valid: boolean;
  reason: string | null;
  busy: boolean;
  onAdd: (item: string) => void;
  onRotate: () => void;
  onRemove: () => void;
  onDone: () => void;
  onCancel: () => void;
}> = p => {
  const t = useT();
  const ids = Object.keys(p.left);
  return (
    <View style={styles.panel} testID="garden-decorate">
      {p.reason ? <Text style={styles.error} testID="garden-decorate-reason">{p.reason}</Text> : null}
      <Text style={styles.section}>{t('garden.edit.tray')}</Text>
      {ids.length === 0 ? <Text style={styles.note}>{t('garden.edit.empty')}</Text> : (
        <ScrollView horizontal contentContainerStyle={styles.tray}>
          {ids.map(id => <Small key={id} testID={`garden-tray-${id}`} quiet label={`${t(decorKey(id))} ×${p.left[id]}`} onPress={() => p.onAdd(id)} />)}
        </ScrollView>
      )}
      <View style={styles.tools}>
        <Small testID="garden-edit-rotate" quiet label={t('garden.edit.rotate')} onPress={p.onRotate} disabled={!p.selected} />
        <Small testID="garden-edit-remove" quiet label={t('garden.edit.remove')} onPress={p.onRemove} disabled={!p.selected} />
      </View>
      <View style={styles.tools}>
        <Small testID="garden-edit-cancel" quiet label={t('garden.edit.cancel')} onPress={p.onCancel} disabled={p.busy} />
        <Small testID="garden-edit-done" label={t('garden.edit.done')} onPress={p.onDone} disabled={p.busy || !p.valid} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(14,31,26,0.94)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(242,207,122,0.35)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontFamily: SERIF, fontSize: 18, color: GARDEN.mist, flexShrink: 1 },
  panelBody: { gap: spacing.sm, paddingBottom: spacing.sm },
  section: { ...typography.tiny, color: GARDEN.sap, letterSpacing: 1, marginTop: spacing.xs },
  line: { fontFamily: SERIF, fontSize: 15, color: GARDEN.mist },
  note: { ...typography.caption, color: GARDEN.dew },
  error: { ...typography.caption, color: colors.trending },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rowLocked: { opacity: 0.5 },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodyStrong, color: GARDEN.mist },
  rowNote: { ...typography.tiny, color: GARDEN.dew, marginTop: 2 },
  small: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: GARDEN.sap },
  smallQuiet: { backgroundColor: 'rgba(232,241,234,0.08)', borderWidth: 1, borderColor: 'rgba(232,241,234,0.25)' },
  smallText: { ...typography.caption, fontWeight: '700', color: '#1B2A1F' },
  smallTextQuiet: { color: GARDEN.mist },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
  biomes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  biome: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(232,241,234,0.2)' },
  biomeOn: { borderColor: GARDEN.leaf, backgroundColor: 'rgba(127,211,168,0.16)' },
  biomeText: { ...typography.caption, color: GARDEN.dew },
  biomeTextOn: { color: GARDEN.mist },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(232,241,234,0.2)' },
  tabOn: { borderColor: GARDEN.sap, backgroundColor: 'rgba(242,207,122,0.14)' },
  tabText: { ...typography.caption, color: GARDEN.dew },
  tabTextOn: { color: GARDEN.sap },
  plotPick: { paddingLeft: spacing.md, gap: spacing.xs, paddingBottom: spacing.sm },
  tray: { gap: spacing.sm },
  tools: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
