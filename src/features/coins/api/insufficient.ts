import { useCoins } from '../store/coinStore';

/**
 * A 402 INSUFFICIENT_COINS answer, the same for every coin spend (My Room's shop, the journey's
 * paid moments): nothing was charged, here is the price and what the account has.
 *
 * `price` is null when the server did not say. The wallet is written HERE, in the API layer, and
 * nowhere above it — a caller only reads `balance`. When the reply carries no balance the wallet is
 * left alone and `balance` is the last one the app knew, so a terse 402 can never zero the pill.
 */
export interface InsufficientCoins {
  kind: 'insufficient';
  price: number | null;
  balance: number;
}

export function readInsufficient(body: unknown): InsufficientCoins {
  const b = (body ?? {}) as { price?: unknown; coin_balance?: unknown };
  const price = b.price != null && Number.isFinite(Number(b.price)) ? Number(b.price) : null;
  const told = b.coin_balance != null && Number.isFinite(Number(b.coin_balance)) ? Number(b.coin_balance) : null;
  if (told != null) useCoins.getState().setBalance(told);
  return { kind: 'insufficient', price, balance: told ?? useCoins.getState().balance ?? 0 };
}
