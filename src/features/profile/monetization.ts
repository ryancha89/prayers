/**
 * Monetization is intentionally NOT implemented in the first pass (spec §34).
 * These interfaces reserve the architecture so real billing can drop in later
 * without hard-coded payment assumptions.
 */

export interface CreditsWallet {
  balance: number;
  currency: 'credits';
}

export type EntitlementKind = 'credits' | 'sessionPass' | 'subscription' | 'oneOff';

export interface Entitlement {
  kind: EntitlementKind;
  label: string;
  active: boolean;
}

export interface BillingService {
  getWallet(): Promise<CreditsWallet>;
  getEntitlements(): Promise<Entitlement[]>;
  purchase(kind: EntitlementKind): Promise<void>;
}

/** Placeholder wallet for the MVP UI. */
export const mockWallet: CreditsWallet = { balance: 120, currency: 'credits' };
