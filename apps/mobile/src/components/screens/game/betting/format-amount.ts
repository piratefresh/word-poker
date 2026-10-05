/**
 * The action row's figure, kept short so a big pot never widens a button: $40, $850, $1.2K, $24K.
 * The confirm sheet and the slider still print the exact number.
 */
export function formatCompactAmount(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n < 1_000) return `$${n}`;
  if (n < 1_000_000) return `$${scaled(n / 1_000)}K`;
  return `$${scaled(n / 1_000_000)}M`;
}

/** One decimal under 10, none above; a trailing ".0" is dropped. */
function scaled(x: number): string {
  if (x >= 10) return String(Math.round(x));
  const fixed = x.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}
