export function toCents(yuan: number) {
  if (!Number.isFinite(yuan)) return 0;
  return Math.round(Number(yuan.toFixed(2)) * 100);
}

export function fromCents(cents: number) {
  return Math.round(cents) / 100;
}

export function billFingerprint(row: { date: string; merchant: string; amount: number; note?: string; sourceId?: string }) {
  const source = row.sourceId?.trim();
  if (source) return `src:${source}`;
  const merchant = row.merchant.trim();
  const note = (row.note ?? '').trim();
  return `fp:${row.date}|${merchant}|${toCents(row.amount)}|${note}`;
}
