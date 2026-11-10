import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationKey } from '../../shared/i18n';
import { devlog } from '../../shared/devlog';
import type { GardenBridge, MyRoomItem } from '../counseling/types';
import {
  buyDecor,
  buyPlot,
  buySeed,
  plantSeed,
  saveLayout,
  type Element,
  type Garden,
  type GardenCatalog,
  type GardenLayoutState,
  type ShopResult,
} from './api/gardenApi';
import { decorLeft, islandPayload, layoutReasonKey, shopErrorKey, type Sky } from './island';
import type { ShopTab } from './components/IslandPanels';

/**
 * Tree of Mind phase 2's island, for GardenScreen: what the shop and the plot sheet show, the Gold
 * spends (server-side, an idem key per intent), the plant flow, the sky, and decor edit mode — My
 * Room's flow (GARDEN_EDIT → GARDEN_LAYOUT_CHANGED → PUT with version → GARDEN_LAYOUT) on the garden's
 * calls. Unity is told the island on every change (GARDEN_ISLAND) and the saved decor (GARDEN_LAYOUT).
 */
export type Panel = null | { kind: 'shop' } | { kind: 'plot'; index: number } | { kind: 'collection' };

export interface IslandInit {
  catalog: GardenCatalog;
  ownedDecor: Record<string, number>;
  layout: GardenLayoutState;
}

export function useIsland(opts: {
  bridge: GardenBridge;
  garden: Garden | null;
  setGarden: (g: Garden) => void;
  /** Decor edit mode starts / ends (the screen switches its step). */
  onEditing: (on: boolean) => void;
}) {
  const { bridge, garden, setGarden, onEditing } = opts;
  const [catalog, setCatalog] = useState<GardenCatalog | null>(null);
  const [ownedDecor, setOwnedDecor] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<GardenLayoutState>({ items: null, orb: null, music: null, version: 0 });
  const [env, setEnv] = useState<{ sky: Sky; rain: boolean }>({ sky: 'day', rain: false });
  const [panel, setPanel] = useState<Panel>(null);
  const [tab, setTab] = useState<ShopTab>('seeds');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [plantingSeed, setPlantingSeed] = useState<number | null>(null);
  // Decor edit mode: Unity's working copy, whether it may be saved, and the selection.
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<MyRoomItem[] | null>(null);
  const [valid, setValid] = useState(true);
  const [reason, setReason] = useState<TranslationKey | null>(null);
  const [selected, setSelected] = useState('');
  /** Separates two purchases of the same thing made on purpose (a new intent each). */
  const nonce = useRef(0);

  const init = useCallback((i: IslandInit) => {
    setCatalog(i.catalog);
    setOwnedDecor(i.ownedDecor);
    setLayout(i.layout);
    bridge.sendGardenLayout(i.layout.items);
  }, [bridge]);

  // Unity always draws the island as the server last said it.
  useEffect(() => {
    if (garden) bridge.sendGardenIsland(islandPayload(garden, env, layout.orb));
  }, [bridge, garden, env, layout.orb]);

  useEffect(() => bridge.onEvent(e => {
    if (e.type === 'GARDEN_PLOT_TAP') { setError(null); setPanel({ kind: 'plot', index: e.payload.index }); }
    else if (e.type === 'GARDEN_SELECT') setSelected(e.payload.uid);
    else if (e.type === 'GARDEN_LAYOUT_CHANGED') {
      setWorking(e.payload.layout?.items ?? []);
      setValid(e.payload.valid);
      setReason(layoutReasonKey(e.payload.reason));
    }
  }), [bridge]);

  const spend = async <T,>(call: () => Promise<ShopResult<T>>, then?: (r: { ok: true } & T) => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) {
      setError(shopErrorKey(r));
      return;
    }
    if (r.garden) setGarden(r.garden);
    then?.(r as { ok: true } & T);
  };

  const buyLand = (index: number, el: Element) => spend(() => buyPlot(index, el));
  const buyOneSeed = (species: string) => spend(() => buySeed(species, String(++nonce.current)));
  const plant = (seedId: number, plot: number) => spend(() => plantSeed(seedId, plot), () => setPlantingSeed(null));
  const buyOneDecor = (sku: string) => spend(() => buyDecor(sku, String(++nonce.current)), r => setOwnedDecor(r.ownedDecor));

  const save = async (items: MyRoomItem[] | null, orb: string | null, music: string | null): Promise<boolean> => {
    setBusy(true);
    const r = await saveLayout({ items, orb, music }, layout.version);
    setBusy(false);
    if (r.kind === 'saved') {
      setLayout(r.layout);
      setOwnedDecor(r.ownedDecor);
      bridge.sendGardenLayout(r.layout.items);
      if (r.dropped.length) devlog(`[garden] layout dropped ${r.dropped.map(d => `${d.item}:${d.reason}`).join(',')}`);
      return true;
    }
    if (r.kind === 'conflict') {
      setLayout(r.layout);
      bridge.sendGardenLayout(r.layout.items);
      setError('garden.edit.conflict');
      return true;
    }
    setError(r.kind === 'invalid' ? 'garden.edit.reason.other' : 'garden.error.offline');
    return false;
  };

  const chooseEffect = (kind: 'orb' | 'music', id: string | null) =>
    save(layout.items, kind === 'orb' ? id : layout.orb, kind === 'music' ? id : layout.music);

  const startEdit = () => {
    setPanel(null);
    setError(null);
    setWorking(layout.items ?? []);
    setValid(true);
    setReason(null);
    setSelected('');
    setEditing(true);
    onEditing(true);
    bridge.sendGardenEdit(true);
  };

  const endEdit = (cancel: boolean) => {
    bridge.sendGardenEdit(false, cancel || undefined);
    setEditing(false);
    setSelected('');
    onEditing(false);
  };

  const done = async () => {
    if (await save(working, layout.orb, layout.music)) endEdit(false);
  };

  const left = catalog ? decorLeft(ownedDecor, editing ? working : layout.items, catalog) : {};

  return {
    catalog, ownedDecor, layout, env, setEnv, panel, setPanel, tab, setTab, busy, error, setError,
    plantingSeed, setPlantingSeed, editing, valid, reason, selected, left,
    init, buyLand, buyOneSeed, plant, buyOneDecor, chooseEffect, startEdit, endEdit, done,
  };
}
