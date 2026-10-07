import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { useCoins } from '../../coins/store/coinStore';
import { noteFurniture } from '../inbox/inboxStore';

/**
 * My Room's shop (spec 005 US3, saju_server Api::V1::Prayers::MyroomController):
 *
 *   GET  prayers/myroom/catalog   → { items: [{id, kind, category, size, theme, price, starter, owned}],
 *                                     themes: [{id, price, starter, owned}], coin_balance }
 *   GET  prayers/myroom           → { …layout, owned: {items: {Sofa: 2}, themes: [...]}, coin_balance }
 *   POST prayers/myroom/purchase  {sku, idem_key} → { sku, charged, coin_balance, owned: {items, themes} }
 *        402 INSUFFICIENT_COINS {price, coin_balance} · 404 UNKNOWN_SKU · 409 ALREADY_OWNED
 *
 * The server owns prices, ownership and the wallet; this reads them and never decides a purchase
 * happened. The layout itself (PUT prayers/myroom) is Unity's to edit (spec 005 decorate mode, not
 * built yet); only GET's `owned` is read here — it includes pieces no longer on sale (the diary book).
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
}

export interface Owned {
  items: Record<string, number>;
  themes: string[];
}

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
      })),
      themes: (Array.isArray(b.themes) ? b.themes : []).map((th: any) => ({
        id: String(th.id),
        price: Number(th.price ?? 0),
        starter: th.starter === true,
        owned: th.owned === true,
      })),
      coinBalance: balance,
    };
  } catch {
    return null;
  }
}

const readOwned = (o: any): Owned => ({
  items: o?.items && typeof o.items === 'object' && !Array.isArray(o.items) ? o.items : {},
  themes: Array.isArray(o?.themes) ? o.themes.map(String) : [],
});

/** What the account owns, copies per piece (starter + bought). */
export async function fetchMyRoomOwned(signal?: AbortSignal): Promise<Owned | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    if (typeof b.coin_balance === 'number') useCoins.getState().setBalance(b.coin_balance);
    return readOwned(b.owned);
  } catch {
    return null;
  }
}

export type BuySkuResult =
  | { ok: true; charged: number; balance: number; owned: Owned }
  | { ok: false; reason: 'insufficient'; price: number; balance: number }
  | { ok: false; reason: 'owned' | 'unknown' | 'failed' };

/** One idempotency key per tap (server: /\A[A-Za-z0-9_-]{8,64}\z/): a retry of the same tap reuses it. */
export const newIdemKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** Buy one copy of a piece (`item:Sofa`) or a theme (`theme:modern`). */
export async function buyMyRoomSku(sku: string, idemKey: string = newIdemKey()): Promise<BuySkuResult> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/myroom/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, idem_key: idemKey }),
    });
    if (!res) return { ok: false, reason: 'failed' };
    const b = await res.json().catch(() => null);
    if (res.status === 402) {
      const balance = Number(b?.coin_balance ?? 0);
      useCoins.getState().setBalance(balance);
      return { ok: false, reason: 'insufficient', price: Number(b?.price ?? 0), balance };
    }
    if (res.status === 409) return { ok: false, reason: 'owned' };
    if (res.status === 404) return { ok: false, reason: 'unknown' };
    if (!res.ok || !b?.success) return { ok: false, reason: 'failed' };
    const balance = Number(b.coin_balance ?? 0);
    const charged = Number(b.charged ?? 0);
    useCoins.getState().setBalance(balance);
    // Every tap has its own key, so a success is a new copy (charged 0 = coins switched off on the
    // server, PRAYERS_MYROOM_COINS=off) — and it gets a receipt.
    noteFurniture(String(b.sku ?? sku), charged);
    return {
      ok: true,
      charged,
      balance,
      owned: readOwned(b.owned),
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
