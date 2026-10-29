import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { CONSULT_COST } from '../../coins/api/coinsApi';

/**
 * What a consultation turn costs THIS player, as the server will charge it (29-10).
 *
 * The room gated the mic, the chip and Retry on the hard-coded CONSULT_COST (10). The server's
 * Prayers::CoinGate is not that simple: with PRAYERS_CONSULT_COINS=off every turn is free, and in
 * development a wallet that cannot pay is let through for 0. A dev- account on local :4000 has 0
 * coins, so every question went to the coin card and nothing was ever sent — for turns the server
 * would have answered free.
 *
 *   GET prayers/tickets_balance → { coin_balance, consult_cost, pro_consult_cost, tickets_size, … }
 *
 * `consult_cost` is new on 29-10; a server without it (production until deployed) keeps 10. The
 * server still decides: this is the polite check on the way in, not the charge.
 */
export interface ConsultPrice {
  balance: number;
  /** Coins the next normal turn needs; 0 = free. */
  cost: number;
}

/** The price in a tickets_balance body. Absent or malformed = the old fixed price. */
export function consultCostOf(body: unknown): number {
  const c = (body as { consult_cost?: unknown } | null)?.consult_cost;
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 ? c : CONSULT_COST;
}

/** Whether a turn may go out: an unknown balance is let through (the server refuses if it must). */
export function canAffordTurn(balance: number | null | undefined, cost: number): boolean {
  return balance == null || balance >= cost;
}

/** `null` = no answer (signed out, offline, an old server's error); the caller keeps what it had. */
export async function fetchConsultPrice(signal?: AbortSignal): Promise<ConsultPrice | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/tickets_balance`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (typeof b?.coin_balance !== 'number') return null;
    return { balance: b.coin_balance, cost: consultCostOf(b) };
  } catch {
    return null;
  }
}
