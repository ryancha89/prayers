import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { devlog } from '../../../shared/devlog';
import type { MyRoomBridge, MyRoomLayout, MyRoomOwned, MyRoomSelect } from '../../counseling/types';
import { buyMyRoomSku, fetchMyRoomCatalog, purchaseKeyFor, type CatalogItem, type CatalogTheme } from '../api/myRoomApi';
import { useCoins } from '../../coins/store/coinStore';
import { myRoomUserKey, useMyRoomStore } from '../store/myRoomStore';
import { UNDO_DEPTH, isAddRefusal, layoutsEqual, reasonKey, themeOwned } from './decorate';
import { itemName } from '../names';

/**
 * Decorate mode, the RN half (spec 005 T025). Unity owns the room in edit mode — selection, the
 * drag, validity — and reports it (MYROOM_SELECT, MYROOM_LAYOUT_CHANGED); this owns the buttons and
 * the save, and never edits a layout itself.
 *
 *   enter   MYROOM_EDIT on (standing up first if seated). Only with the room up and the server
 *           reachable: a save needs the version the GET brought.
 *   Done    PUT the last reported layout → on success MYROOM_EDIT off, then MYROOM_LAYOUT with the
 *           server's normalised copy. 409: say so and show THEIR room (MYROOM_LAYOUT), still in edit
 *           mode, nothing merged. 422 / offline / 401: say so, keep the edit.
 *   Cancel  MYROOM_EDIT off + cancel: Unity puts the room back as it was. Asks first when the
 *           working copy differs from the room at entry; Done with no difference leaves without a PUT.
 *   Undo    the last UNDO_DEPTH working copies that the player's OWN edits replaced, sent back as
 *           MYROOM_LAYOUT (Unity keeps its cancel snapshot). Only an edit pushes: the entry report,
 *           a server reload (409, resume) and Undo's own echo do not. A drag is one step, from
 *           the layout at DRAG begin to the first report after DRAG end; mid-drag reports are ignored.
 *
 * The working copy lives in myRoomStore (not this hook), so a remount — the app backgrounded and
 * the screen rebuilt — picks the edit up again: edit mode back on, and the copy sent as
 * MYROOM_LAYOUT.
 */
/** How long the walk HUD waits for Unity's MYROOM_LAYOUT_APPLIED after edit mode ends. */
export const SETTLE_MS = 300;

export function useDecorate(opts: {
  bridge: MyRoomBridge;
  /** MYROOM_READY has come. */
  roomUp: boolean;
  /** This visit's GET answered, so a save has a version to send. */
  online: boolean;
  /** The player is using a piece (seated, resting…): stand first. */
  acting: boolean;
  /** A short line over the room. */
  say(line: string): void;
  /** The room now shows `layout` (the screen keeps it as what Unity was last sent). */
  showLayout(layout: MyRoomLayout, owned: MyRoomOwned | null): void;
}) {
  const t = useT();
  const o = useRef(opts);
  o.current = opts;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<MyRoomSelect | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [catalogThemes, setCatalogThemes] = useState<CatalogTheme[] | null>(null);
  // Stage 1 sells skins only: the server says so in the catalog (furniture_for_sale), and the tray's
  // furniture Shop follows it. False until the catalog answers — a Shop tab that appears and then
  // vanishes is worse than one that appears late.
  const [furnitureForSale, setFurnitureForSale] = useState(false);
  // Just out of edit mode: the walk HUD waits for Unity to have the room back (its next
  // MYROOM_LAYOUT_APPLIED) or SETTLE_MS, so it never flashes over the edit camera on the way out.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endSettling = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    setSettling(false);
  }, []);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  const owned = useMyRoomStore(s => s.byUser[myRoomUserKey()]?.owned ?? null);
  const [buyingSkin, setBuyingSkin] = useState(false);
  const buyingSkinRef = useRef(false);
  const pending = useMyRoomStore(s => s.pendingEdit());
  const editingRef = useRef(false);
  editingRef.current = editing;
  // The room as edit mode found it (Unity's first report), and the undo stack above it.
  const [entry, setEntry] = useState<MyRoomLayout | null>(null);
  const [history, setHistory] = useState<MyRoomLayout[]>([]);
  const awaitingEntry = useRef(false);
  /** The player's own edits sent and not yet reported back. A report that answers one pushes. */
  const userEdits = useRef(0);
  // A drag is ONE step (sim QA run4: Undo after a drag reverted the rotate before it). Unity reports
  // mid-drag frames too (its overlap/bounds checks while moving), so by the time the finger lifts the
  // working copy is already at the drop: the step's "before" is the layout at DRAG begin, kept here,
  // and every report between begin and end is ignored for undo.
  const dragging = useRef(false);
  const dragFrom = useRef<MyRoomLayout | null>(null);
  /** The "before" for the next report that answers an edit, when it is not simply the working copy. */
  const editFrom = useRef<MyRoomLayout | null>(null);
  const resetEdits = useCallback(() => {
    userEdits.current = 0;
    dragging.current = false;
    dragFrom.current = null;
    editFrom.current = null;
  }, []);
  /** A piece just added from storage: its report gets a "placed — drag to adjust" note. */
  const placing = useRef<string | null>(null);
  // The three-step coach: shown on an account's first visit, replayed from "?".
  const [coachStep, setCoachStep] = useState<number | null>(null);

  const loadCatalog = useCallback(() => {
    fetchMyRoomCatalog().then(c => {
      if (!c) return;
      setCatalog(c.items);
      setCatalogThemes(c.themes);
      setFurnitureForSale(c.furnitureForSale);
    });
  }, []);

  useEffect(() => o.current.bridge.onEvent(e => {
    if (e.type === 'MYROOM_LAYOUT_APPLIED') { endSettling(); return; }
    if (!editingRef.current) return;
    if (e.type === 'MYROOM_SELECT') {
      const p = e.payload;
      if (p && p.uid) sfx.select();
      setSelected(p && p.uid ? p : null);
    } else if (e.type === 'MYROOM_LAYOUT_CHANGED') {
      const p = e.payload;
      if (!p?.layout) return;
      const store = useMyRoomStore.getState();
      const before = store.pendingEdit()?.layout ?? null;
      if (awaitingEntry.current) {
        awaitingEntry.current = false;
        setEntry(p.layout);
      } else if (dragging.current) {
        // A mid-drag frame: the room as it moves, not a step.
      } else if (userEdits.current > 0) {
        userEdits.current -= 1;
        const from = editFrom.current ?? before;
        editFrom.current = null;
        // A refused add or theme comes back unchanged: nothing to undo.
        if (from && !layoutsEqual(from, p.layout)) setHistory(h => [...h, from].slice(-UNDO_DEPTH));
      }
      store.setPending({ layout: p.layout, valid: p.valid === true, reason: p.reason ?? '', uid: p.uid ?? '' });
      const added = placing.current;
      placing.current = null;
      if (isAddRefusal(p.reason)) o.current.say(t(reasonKey(p.reason)!));
      else if (p.stored && p.stored.length > 0) o.current.say(t('myroom.edit.storedWith', { count: p.stored.length }));
      else if (added) o.current.say(t('myroom.edit.placed', { name: itemName(t, added) || added }));
    }
  }), [t, endSettling]);

  const canEnter = opts.roomUp && opts.online;

  /** A fresh edit session: no entry yet, nothing to undo. */
  const begin = useCallback(() => {
    awaitingEntry.current = true;
    resetEdits();
    placing.current = null;
    setEntry(null);
    setHistory([]);
    setEditing(true);
    setSelected(null);
  }, [resetEdits]);

  const enter = useCallback(() => {
    const { roomUp, online, bridge, acting } = o.current;
    if (!roomUp || !online) {
      sfx.tap();
      o.current.say(t(roomUp ? 'myroom.edit.needsConnection' : 'myroom.loading'));
      return false;
    }
    sfx.select();
    if (acting) bridge.endMyRoomAct();
    begin();
    bridge.sendMyRoomEdit(true);
    loadCatalog();
    const store = useMyRoomStore.getState();
    if (!store.coachSeen[myRoomUserKey()]) {
      store.markCoachSeen();
      setCoachStep(0);
    }
    return true;
  }, [t, loadCatalog, begin]);

  // An edit left open by a remount (spec 005 edge case): back into edit mode on the kept copy, once
  // the room is up and the server reachable — the same conditions as the button.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || editing || !canEnter) return;
    const kept = useMyRoomStore.getState().pendingEdit();
    if (!kept) return;
    resumed.current = true;
    devlog('[myroom] resuming an unsaved edit');
    begin();
    o.current.bridge.sendMyRoomEdit(true);
    loadCatalog();
    o.current.bridge.sendMyRoomLayout(kept.layout);
  }, [canEnter, editing, loadCatalog, begin]);

  const leave = () => {
    useMyRoomStore.getState().setPending(null);
    setSettling(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(endSettling, SETTLE_MS);
    setEditing(false);
    setSelected(null);
    setEntry(null);
    setHistory([]);
    resetEdits();
    placing.current = null;
    awaitingEntry.current = false;
  };

  /** Anything to lose? The working copy against the room as edit mode found it. */
  const changed = () => {
    const now = useMyRoomStore.getState().pendingEdit()?.layout ?? null;
    return !!entry && !!now && !layoutsEqual(entry, now);
  };

  const discard = () => {
    sfx.back();
    o.current.bridge.sendMyRoomEdit(false, true);
    leave();
  };

  /** Cancel: at once when nothing changed; otherwise the app's confirm (as account deletion asks). */
  const cancel = () => {
    if (!changed()) { discard(); return; }
    sfx.tap();
    Alert.alert(t('myroom.edit.discardTitle'), undefined, [
      { text: t('myroom.edit.keepEditing'), style: 'cancel' },
      { text: t('myroom.edit.discard'), style: 'destructive', onPress: discard },
    ]);
  };

  /** The working copy before the player's last edit, back in the room. */
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    sfx.select();
    setHistory(h => h.slice(0, -1));
    // Undo's own echo is not an edit; anything still in flight is superseded by this.
    resetEdits();
    placing.current = null;
    o.current.bridge.sendMyRoomLayout(prev);
  };

  /** A layout from outside the player's hands (409: theirs) — not undoable back across. */
  const reload = (layout: MyRoomLayout, own: MyRoomOwned | null) => {
    resetEdits();
    setHistory([]);
    o.current.showLayout(layout, own);
  };

  /** One of the player's own edits: its report pushes an undo step. */
  const edit = (send: () => void) => {
    userEdits.current += 1;
    send();
  };

  // A skin previewed but not owned (US3 acceptance 3): it can be looked at, not kept. Done stays off
  // and the bar offers to buy it; going back to an owned skin, or Cancel, ends it by itself.
  const workingTheme = pending?.layout.theme ?? null;
  const unownedSkin = workingTheme != null && !themeOwned(workingTheme, owned, catalogThemes)
    ? { id: workingTheme, price: catalogThemes?.find(th => th.id === workingTheme)?.price ?? null }
    : null;

  const buySkin = async () => {
    if (!unownedSkin || buyingSkinRef.current) return;
    const sku = `theme:${unownedSkin.id}`;
    const { balance } = useCoins.getState();
    if (unownedSkin.price != null && balance != null && balance < unownedSkin.price) {
      sfx.tap();
      useCoins.getState().openShop();
      return;
    }
    sfx.select();
    buyingSkinRef.current = true;
    setBuyingSkin(true);
    const r = await buyMyRoomSku(sku, purchaseKeyFor(sku)).finally(() => {
      buyingSkinRef.current = false;
      setBuyingSkin(false);
    });
    const { say } = o.current;
    if (r.ok) {
      useMyRoomStore.getState().setOwned(r.owned);
      say(t('myroom.skin.bought'));
    } else if (r.kind === 'insufficient') {
      useCoins.getState().openShop();
    } else if (r.kind === 'owned' || r.kind === 'keyReused') {
      say(t(r.kind === 'owned' ? 'myroom.decor.alreadyOwned' : 'myroom.decor.keyReused'));
      useMyRoomStore.getState().refresh();
    } else {
      say(t('myroom.decor.failed'));
    }
  };

  const done = async () => {
    const working = useMyRoomStore.getState().pendingEdit();
    if (savingRef.current || !working?.valid) return;
    // Never send a skin the account does not own: the server would drop it, but RN gates first.
    if (!themeOwned(working.layout.theme, useMyRoomStore.getState().current()?.owned, catalogThemes)) return;
    // Nothing changed: leave, no PUT (a save would only bump the version).
    if (!changed()) {
      sfx.select();
      o.current.bridge.sendMyRoomEdit(false);
      leave();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    sfx.select();
    const r = await useMyRoomStore.getState().saveLayout(working.layout).finally(() => {
      savingRef.current = false;
      setSaving(false);
    });
    const { bridge, say, showLayout } = o.current;
    if (r.kind === 'saved') {
      bridge.sendMyRoomEdit(false);
      showLayout(r.layout, r.owned);
      leave();
      say(r.dropped.length ? t('myroom.edit.savedDropped', { count: r.dropped.length }) : t('myroom.edit.saved'));
    } else if (r.kind === 'conflict') {
      // Their room, shown as it is; the player decorates again from there. Nothing merged.
      say(t('myroom.edit.conflict'));
      reload(r.layout, r.owned);
    } else if (r.kind === 'invalid') {
      devlog(`[myroom] save refused: ${r.reasons.join(',')}`);
      say(t('myroom.edit.invalid'));
    } else {
      say(t('myroom.edit.saveFailed'));
    }
  };

  const b = opts.bridge;
  return {
    editing,
    canEnter,
    selected,
    saving,
    catalog,
    catalogThemes,
    /** The server sells single pieces right now (see furnitureForSale above). */
    furnitureForSale,
    /** A purchase came back 403 NOT_FOR_SALE: this client's catalog was stale. Say so, re-read it. */
    notForSale: () => { o.current.say(t('myroom.decor.notForSale')); loadCatalog(); },
    /** Just left edit mode; the walk HUD is still held back. */
    settling,
    owned,
    /** The working skin when it is not owned (with its price), or null. */
    unownedSkin,
    buyingSkin,
    buySkin,
    /** Unity's last word on the working copy; null until the first MYROOM_LAYOUT_CHANGED. */
    pending,
    enter,
    cancel,
    done,
    undo,
    canUndo: history.length > 0,
    /** The working copy differs from the room at entry. */
    changed: changed(),
    coachStep,
    showCoach: () => { sfx.tap(); setCoachStep(0); },
    nextCoach: () => setCoachStep(s => (s == null || s >= 2 ? null : s + 1)),
    tap: (x: number, y: number) => b.sendMyRoomTap(x, y),
    // A drag is one edit: Unity reports once, when the finger lifts.
    drag: (phase: 'begin' | 'move' | 'end', x: number, y: number) => {
      if (phase === 'begin') {
        dragging.current = true;
        dragFrom.current = useMyRoomStore.getState().pendingEdit()?.layout ?? null;
        b.sendMyRoomDrag(phase, x, y);
      } else if (phase === 'end') {
        dragging.current = false;
        editFrom.current = dragFrom.current;
        dragFrom.current = null;
        edit(() => b.sendMyRoomDrag(phase, x, y));
      } else {
        b.sendMyRoomDrag(phase, x, y);
      }
    },
    rotate: (step: 1 | -1) => { sfx.tap(); edit(() => b.sendMyRoomRotate(step)); },
    swap: (item: string) => { sfx.select(); edit(() => b.sendMyRoomSwap(item)); },
    store: () => { sfx.tap(); edit(() => b.sendMyRoomRemove()); },
    add: (item: string) => { sfx.select(); placing.current = item; edit(() => b.sendMyRoomAdd(item)); },
    theme: (id: string) => { sfx.tap(); edit(() => b.sendMyRoomTheme(id)); },
  };
}

export type Decorate = ReturnType<typeof useDecorate>;
