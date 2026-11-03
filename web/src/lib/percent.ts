/**
 * Share/percentage formatting used by the Population Overview. One utility so
 * rounding (one decimal) and the divide-by-zero guard live in exactly one
 * place. Counts only — never patient identifiers.
 */

/** 0..1 share of `count` in `total`; 0 when the total is 0 or negative. */
export function share(count: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return count / total;
}

/** Percentage 0..100 rounded to one decimal ("33.3"); 0 for empty totals. */
export function percentValue(count: number, total: number): number {
  return Math.round(share(count, total) * 1000) / 10;
}

/** Rendered percentage with exactly one decimal ("0.0%", "33.3%", "100.0%"). */
export function formatPercent(count: number, total: number): string {
  return `${percentValue(count, total).toFixed(1)}%`;
}
