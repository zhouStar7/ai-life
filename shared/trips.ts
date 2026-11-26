export type TripDates = { startDate?: string | null; endDate?: string | null; dateLabel: string };
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function inferTripDates(label: string, times: string[], reference: string) {
  const source = [label, ...times].join(' ');
  const explicit = [...source.matchAll(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/g)]
    .map(m => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`).filter(validDate);
  if (explicit.length) { explicit.sort(); return { startDate: explicit[0], endDate: explicit.at(-1)! }; }
  const matches = [...label.matchAll(/(\d{1,2})[月/-](\d{1,2})日?/g)];
  const fallback = matches.length ? matches : [...times.join(' ').matchAll(/(\d{1,2})[月/-](\d{1,2})日?/g)];
  if (!fallback.length) return { startDate: null, endDate: null };
  const year = Number(reference.slice(0, 4));
  const day = (m: RegExpMatchArray, y: number) => `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const startDate = day(fallback[0], year);
  let endDate = day(fallback.at(-1)!, year);
  if (endDate < startDate) endDate = day(fallback.at(-1)!, year + 1);
  return validDate(startDate) && validDate(endDate) ? { startDate, endDate } : { startDate: null, endDate: null };
}
export function tripStatus(trip: TripDates, today: string) {
  if (!trip.startDate || !trip.endDate) return '日期待定' as const;
  if (trip.endDate < today) return '已结束' as const;
  if (trip.startDate > today) return '即将开始' as const;
  return '进行中' as const;
}
