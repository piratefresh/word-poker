/**
 * format.ts — presentational number formatting shared by the HUD, the seat, and
 * the pot summary. Chips are whole units, so nothing here emits decimals.
 *
 * Grouping is done by hand rather than with `toLocaleString`: the same amount has
 * to render identically on iOS, Android, and web, and a device locale that groups
 * with dots or spaces would change the UI under us.
 */

/**
 * `$1,240` — grouped, no decimals. Non-finite and fractional input is floored.
 *
 * Carries the `"worklet"` directive because the results pot formats each frame of its count-up
 * from inside an `animatedProps` updater, on the UI thread: a plain function cannot be called
 * from there. The directive changes nothing for the many JS-thread callers — it only registers
 * the function with the worklet runtime as well.
 */
export function formatAmount(amount: number): string {
  "worklet";

  const whole = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const sign = whole < 0 ? "-" : "";
  const digits = Math.abs(whole).toString();
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** `12,000` — grouped like `formatAmount`, but with no `$`: the Wallet's coins, not chips. */
export function formatCoins(coins: number): string {
  const whole = Number.isFinite(coins) ? Math.trunc(coins) : 0;
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Scale suffix for stacks that no longer fit a seat row. */
const COMPACT_STEPS = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "K" },
] as const;

/**
 * `$981`, `$12.5K`, `$3.4M` — the short form a seat row can hold. Amounts below
 * 1000 are exact; above that, one decimal is kept up to three significant digits
 * and dropped beyond, so a stack reads as a magnitude at a glance. A trailing `.0`
 * never appears. The caller keeps `formatAmount` in the accessibility label, so
 * the exact value is never lost.
 */
export function formatAmountCompact(amount: number): string {
  const whole = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const sign = whole < 0 ? "-" : "";
  const magnitude = Math.abs(whole);

  for (const { limit, suffix } of COMPACT_STEPS) {
    if (magnitude < limit) continue;
    const scaled = magnitude / limit;
    const text =
      scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, "") : Math.round(scaled).toString();
    return `${sign}$${text}${suffix}`;
  }

  return `${sign}$${magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
