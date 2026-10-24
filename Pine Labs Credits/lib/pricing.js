// Pure pricing: $1 = 100 credits, pay-as-you-go, $1 minimum. No I/O, safe to import anywhere.

/** Ledger unit shared with the platform wallet (packages/cost-guard): 1 unit = $0.000001. */
export const UNITS_PER_USD = 1_000_000;

export function quote(usd, pricing) {
  const amount = Number(usd);
  if (!Number.isFinite(amount)) throw new Error("Amount must be a number");
  if (amount < pricing.minTopupUsd) throw new Error(`Minimum top-up is $${pricing.minTopupUsd}`);
  if (amount > 10_000) throw new Error("Maximum top-up is $10,000");
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) throw new Error("Use at most two decimals");
  const usdExact = cents / 100;
  const credits = Math.round((cents * pricing.creditsPerUsd) / 100);
  // Pine Labs amounts are in the currency's minor unit (paise for INR, cents for USD).
  const chargeMinor =
    pricing.chargeCurrency === "USD" ? cents : Math.round(cents * pricing.usdToInr);
  return {
    usd: usdExact,
    credits,
    walletUnits: cents * (UNITS_PER_USD / 100),
    charge: { currency: pricing.chargeCurrency, minor: chargeMinor },
    rate: pricing.chargeCurrency === "USD" ? 1 : pricing.usdToInr,
  };
}

export const formatMinor = (minor, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);
