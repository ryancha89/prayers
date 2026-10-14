import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { uuidV4 } from '../../../shared/uuid';
import { authedFetch } from '../../auth/api/headers';
import { useCoins } from '../../coins/store/coinStore';
import { readInsufficient, type InsufficientCoins } from '../../coins/api/insufficient';
import type { MyRoomLayout, MyRoomOwned } from '../../counseling/types';
import { noteFurniture } from '../inbox/inboxStore';

/**
 * My Room on saju_server (spec 005, Api::V1::Prayers::MyroomController):
 *
 *   GET  prayers/myroom           → { theme, items: Item[] | null, version, owned: {items: {Sofa: 2}, themes}, coin_balance }
 *   PUT  prayers/myroom           {theme, items, version} → the GET shape, version + 1, dropped: [{uid, item, reason}]
 *        409 VERSION_CONFLICT + the current layout (GET shape) · 422 LAYOUT_INVALID {reasons}
 *   GET  prayers/myroom/catalog   → { items: [{id, kind, category, size, theme, price, starter, owned}],
 *                                     themes: [{id, price, starter, owned}], coin_balance }
 *   POST prayers/myroom/purchase  {sku, idem_key} → { sku, charged, coin_balance, owned: {items, themes} }
 *        402 INSUFFICIENT_COINS {price, coin_balance} · 404 UNKNOWN_SKU · 409 ALREADY_OWNED
 *        409 IDEM_KEY_REUSED (the key was spent on another sku) · 422 IDEM_KEY_INVALID
 *        403 NOT_FOR_SALE (an `item:` sku while the server sells skins only — stage 1, 14-10)
 *
 * The server owns prices, ownership, the wallet and the layout's canonical shape; this reads them,
 * never decides a purchase happened, and never reshapes a layout on its way to Unity. Every reply
 * that carries `coin_balance` sets the wallet here, in this layer.
 */
export interface CatalogItem {
  id: string;
  kind: string;
  category: string;
  size: string;
  price: number;
  starter: number;
  /** Copies the account has (starter + bought). */
  owned: number;
  /** Can be bought now. Stage 1 (14-10) sells skins only: every piece is listed — Storage groups
   *  and Swap filters by its category — but `buyable: false`. Absent (an older server) = true. */
  buyable: boolean;
}

export interface CatalogTheme {
  id: string;
  price: number;
  starter: boolean;
  owned: boolean;
}

export interface MyRoomCatalog {
  items: CatalogItem[];
  themes: CatalogTheme[];
  coinBalance: number;
  /** The server sells single pieces (`furniture_for_sale`, and at least one piece buyable). False
   *  in stage 1: the tray has no furniture Shop, and Storage never offers to buy. A server constant
   *  flips it back, and the Shop returns by itself. */
  furnitureForSale: boolean;
}

export type Owned = MyRoomOwned;

export async function fetchMyRoomCatalog(signal?: AbortSignal): Promise<MyRoomCatalog | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom/catalog`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    const balance = Number(b.coin_balance ?? 0);
    useCoins.getState().setBalance(balance);
    return {
      items: (Array.isArray(b.items) ? b.items : []).map((i: any) => ({
        id: String(i.id),
        kind: String(i.kind ?? ''),
        category: String(i.category ?? ''),
        size: String(i.size ?? ''),
        price: Number(i.price ?? 0),
        starter: Number(i.starter ?? 0),
        owned: Number(i.owned ?? 0),
        buyable: i.buyable !== false,
      })),
      themes: (Array.isArray(b.themes) ? b.themes : []).map((th: any) => ({
        id: String(th.id),
        price: Number(th.price ?? 0),
        starter: th.starter === true,
        owned: th.owned === true,
      })),
      coinBalance: balance,
      furnitureForSale: b.furniture_for_sale !== false
        && (Array.isArray(b.items) ? b.items : []).some((i: any) => i?.buyable !== false),
    };
  } catch {
    return null;
  }
}

const readOwned = (o: any): Owned => ({
  items: o?.items && typeof o.items === 'object' && !Array.isArray(o.items) ? o.items : {},
  themes: Array.isArray(o?.themes) ? o.themes.map(String) : [],
});

/** The account's room as the server keeps it. `layout.items: null` = never saved (Unity's default). */
export interface MyRoomServerState {
  layout: MyRoomLayout;
  version: number;
  owned: Owned;
}

/** Read the layout/owned part of a GET or PUT reply (also a 409's body). The items go through as the
 *  server sent them: it already normalised them, and Unity reads the same shape. */
function readState(b: any): MyRoomServerState {
  if (typeof b?.coin_balance === 'number') useCoins.getState().setBalance(b.coin_balance);
  return {
    layout: { theme: String(b?.theme || 'basic'), items: Array.isArray(b?.items) ? b.items : null },
    version: Number.isFinite(Number(b?.version)) ? Number(b.version) : 0,
    owned: readOwned(b?.owned),
  };
}

/** GET prayers/myroom. null = no answer (offline, signed out, 5xx): the caller keeps its cache. */
export async function getMyRoom(signal?: AbortSignal): Promise<MyRoomServerState | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    return readState(b);
  } catch {
    return null;
  }
}

/** What the account owns, copies per piece (starter + bought). */
export async function fetchMyRoomOwned(signal?: AbortSignal): Promise<Owned | null> {
  return (await getMyRoom(signal))?.owned ?? null;
}

export interface DroppedPiece {
  /** null for a theme (`item` is then `theme:<id>`). */
  uid: string | null;
  item: string;
  reason: string;
}

export type SaveLayoutResult =
  /** Stored. `layout` is the server's normalised copy — what Unity should show. */
  | ({ kind: 'saved'; dropped: DroppedPiece[] } & MyRoomServerState)
  /** Someone saved first (another device): this is their copy, at its version. Reload it. */
  | ({ kind: 'conflict' } & MyRoomServerState)
  /** Refused as malformed; `reasons` name the fields (`items[0].pos`). Nothing was stored. */
  | { kind: 'invalid'; reasons: string[] }
  /** No answer at all: nothing is known to be stored. */
  | { kind: 'offline' }
  /** Any other answer (401, 5xx, an unreadable body). `status` 0 = no status. */
  | { kind: 'failed'; status: number };

/** PUT prayers/myroom. `version` is the one the layout was loaded at; `items: null` resets the room. */
export async function saveLayout(layout: MyRoomLayout, version: number): Promise<SaveLayoutResult> {
  let res: Response | null | undefined;
  try {
    res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // `items` is always sent, null included: the server refuses a PUT without the key (422), so
      // a client bug cannot silently wipe a room.
      body: JSON.stringify({ theme: layout.theme, items: layout.items, version }),
    });
  } catch (e) {
    devlog(`[myroom] save failed: ${String(e)}`);
    return { kind: 'offline' };
  }
  if (!res) return { kind: 'offline' };
  const b = await res.json().catch(() => null);
  if (res.status === 409 && b?.error_code === 'VERSION_CONFLICT') return { kind: 'conflict', ...readState(b) };
  if (res.status === 422) return { kind: 'invalid', reasons: Array.isArray(b?.reasons) ? b.reasons.map(String) : [] };
  if (!res.ok || !b?.success) {
    devlog(`[myroom] save refused: HTTP ${res.status} ${b?.error_code ?? ''}`);
    return { kind: 'failed', status: res.status ?? 0 };
  }
  const dropped: DroppedPiece[] = Array.isArray(b.dropped)
    ? b.dropped.map((d: any) => ({ uid: d?.uid ?? null, item: String(d?.item ?? ''), reason: String(d?.reason ?? '') }))
    : [];
  if (dropped.length) devlog(`[myroom] save dropped ${dropped.map(d => `${d.item}:${d.reason}`).join(',')}`);
  return { kind: 'saved', dropped, ...readState(b) };
}

export type BuySkuResult =
  | { ok: true; charged: number; balance: number; owned: Owned }
  | ({ ok: false } & InsufficientCoins)
  /** 409: ALREADY_OWNED (a theme), or IDEM_KEY_REUSED (this key paid for another sku). Either
   *  way the list on screen is stale: refresh `owned`. */
  | { ok: false; kind: 'owned' | 'keyReused' }
  | { ok: false; kind: 'unknown' | 'failed' }
  /** 403 NOT_FOR_SALE: a piece while the server sells skins only (a client with a stale catalog). */
  | { ok: false; kind: 'notForSale' };

/** A fresh idempotency key (server: /\A[A-Za-z0-9_-]{8,64}\z/ — a UUID v4 fits). */
export const newIdemKey = (): string => uuidV4();

/**
 * One key per purchase INTENT, not per request. A buy whose answer never arrived (offline, 5xx)
 * keeps its key, so tapping Buy again for the same piece is the same purchase to the ledger —
 * charged once even if the first request did go through. A definitive answer (bought, 402, 404,
 * 409, 422) ends the intent and the next tap starts a new one.
 */
const openIntents = new Map<string, string>();

export function purchaseKeyFor(sku: string): string {
  let key = openIntents.get(sku);
  if (!key) {
    key = newIdemKey();
    openIntents.set(sku, key);
  }
  return key;
}

function endIntent(sku: string, key: string) {
  if (openIntents.get(sku) === key) openIntents.delete(sku);
}

/** Buy one copy of a piece (`item:Sofa`) or a theme (`theme:modern`). */
export async function buyMyRoomSku(sku: string, idemKey: string = purchaseKeyFor(sku)): Promise<BuySkuResult> {
  let res: Response | null | undefined;
  try {
    res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, idem_key: idemKey }),
    });
  } catch {
    return { ok: false, kind: 'failed' }; // no answer: the intent (and its key) stays open
  }
  if (!res) return { ok: false, kind: 'failed' };
  const b = await res.json().catch(() => null);
  // 5xx: the server may or may not have charged; the same key on the retry makes that safe.
  if (res.status >= 500) return { ok: false, kind: 'failed' };
  endIntent(sku, idemKey);
  if (res.status === 402) return { ok: false, ...readInsufficient(b) };
  if (res.status === 409) {
    devlog(`[myroom] purchase ${sku} 409 ${b?.error_code ?? ''}`);
    return { ok: false, kind: b?.error_code === 'IDEM_KEY_REUSED' ? 'keyReused' : 'owned' };
  }
  if (res.status === 404) return { ok: false, kind: 'unknown' };
  if (res.status === 403) {
    devlog(`[myroom] purchase ${sku} 403 ${b?.error_code ?? ''}`);
    return { ok: false, kind: 'notForSale' };
  }
  if (!res.ok || !b?.success) return { ok: false, kind: 'failed' };
  const balance = Number(b.coin_balance ?? 0);
  const charged = Number(b.charged ?? 0);
  useCoins.getState().setBalance(balance);
  // A key is one intent, so a success is a new copy (charged 0 = coins switched off on the server,
  // PRAYERS_MYROOM_COINS=off, or the replay of an intent whose first answer was lost) — and it gets
  // a receipt.
  noteFurniture(String(b.sku ?? sku), charged);
  return {
    ok: true,
    charged,
    balance,
    owned: readOwned(b.owned),
  };
}
