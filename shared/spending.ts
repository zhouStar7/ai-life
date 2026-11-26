const tags = ['衣', '食', '住', '行'] as const;

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function defaultSpendingMonth(today: string, demo: boolean) {
  return demo ? '2026-09' : today.slice(0, 7);
}

export function spendingSummary<T extends { date: string; tag: string }>(rows: readonly T[], month: string, cents: (row: T) => bigint) {
  const [year, number] = month.split('-').map(Number);
  const end = year * 12 + number - 1;
  const totals = new Map<string, bigint>();
  for (let index = end - 5; index <= end; index++) {
    const y = String(Math.floor(index / 12)).padStart(4, '0');
    const m = String(index % 12 + 1).padStart(2, '0');
    totals.set(`${y}-${m}`, 0n);
  }
  const categories = { 衣: 0n, 食: 0n, 住: 0n, 行: 0n };
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const running = totals.get(key);
    if (running === undefined) continue;
    const amount = cents(row);
    totals.set(key, running + amount);
    if (key === month && Object.hasOwn(categories, row.tag)) categories[row.tag as keyof typeof categories] += amount;
  }
  const trend = Array.from(totals, ([month, cents]) => ({ month, label: `${Number(month.slice(5))}月`, amount: Number(cents) / 100 }));
  const byTag = { 衣: 0, 食: 0, 住: 0, 行: 0 };
  for (const tag of tags) byTag[tag] = Number(categories[tag]) / 100;
  return { month, monthTotal: trend[5].amount, byTag, trend };
}
