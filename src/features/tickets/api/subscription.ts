import { apiBase } from '../../../shared/config/api';
import { apiHeaders } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';

/**
 * Question tickets, and the only way this product sells them: a subscription.
 *
 * There is no "buy 10 tickets" endpoint and adding one would be inventing an economy. The server
 * has sold tickets as `savis_lite / savis_standard / savis_max` for as long as saju_front has
 * existed — a starting pack plus a daily allowance — and this app should sell the same thing to
 * the same account rather than a second currency beside it.
 *
 *   GET  /api/v1/ticket_subscription/status    tier · active · expires_at · daily · balance
 *   POST /api/v1/ticket_subscription/activate  after the store confirms a purchase
 *   POST /api/v1/ticket_subscription/claim     today's allowance; safe to call every launch
 *
 * ⚠️ `claim` answers 200 even when there is nothing to claim (not subscribed, already collected
 * today) — deliberately, so the client can call it without branching. Do not read a 200 as "the
 * player just got tickets"; read `granted`.
 */
export const TIERS = ['lite', 'standard', 'max'] as const;
export type Tier = (typeof TIERS)[number];

/** The store product id for a tier. `tier_from_product_id` matches on the bare word, so the
 *  prefix is ours to choose — it must match what is configured in App Store Connect. */
export const productIdFor = (tier: Tier) => `savis_${tier}`;

/** What each tier gives, mirrored from TicketSubscriptionService::TIERS so the screen can say it
 *  before the store has loaded. The server remains the authority that grants them. */
export const TIER_GRANT: Record<Tier, { start: number; daily: number }> = {
  lite: { start: 30, daily: 3 },
  standard: { start: 90, daily: 9 },
  max: { start: 500, daily: 50 },
};

export interface SubscriptionStatus {
  tier: Tier | null;
  active: boolean;
  expiresAt: string | null;
  daily: number | null;
  /** Unused tickets on the account, the same count the room's gate reads. */
  balance: number | null;
}

export async function fetchSubscription(signal?: AbortSignal): Promise<SubscriptionStatus | null> {
  const headers = await apiHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${apiBase()}/api/v1/ticket_subscription/status`, { headers, signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) return null;
    const sub = body.ticket_sub ?? {};
    return {
      tier: (sub.tier as Tier) ?? null,
      active: sub.active === true,
      expiresAt: sub.expires_at ?? null,
      daily: typeof sub.daily === 'number' ? sub.daily : null,
      balance: typeof body.tickets_balance === 'number' ? body.tickets_balance : null,
    };
  } catch {
    return null;
  }
}

/** Tell the server about a purchase the store has already confirmed. */
export async function activateSubscription(input: {
  productId: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresAt?: string;
}): Promise<boolean> {
  const headers = await apiHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${apiBase()}/api/v1/ticket_subscription/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        product_id: input.productId,
        transaction_id: input.transactionId,
        original_transaction_id: input.originalTransactionId,
        expires_at: input.expiresAt,
        platform: 'ios',
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success !== true) {
      if (__DEV__) devlog(`[tickets] activate refused: ${res.status} ${body?.error_code ?? ''}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect today's allowance. Returns how many arrived — 0 is the normal answer most of the time.
 *
 * Called on the way into the tickets screen rather than on a button: an allowance the player has
 * to remember to collect is an allowance they will be annoyed to discover they lost.
 */
export async function claimDaily(): Promise<number> {
  const headers = await apiHeaders();
  if (!headers) return 0;
  try {
    const res = await fetch(`${apiBase()}/api/v1/ticket_subscription/claim`, {
      method: 'POST',
      headers,
      // The server defaults to its own today; sending the DEVICE's date is what makes the
      // allowance land on the day the player is actually living in.
      body: JSON.stringify({ local_date: new Date().toISOString().slice(0, 10) }),
    });
    const body = await res.json().catch(() => null);
    return typeof body?.granted === 'number' ? body.granted : 0;
  } catch {
    return 0;
  }
}
