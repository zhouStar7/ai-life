const DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayIso(now = new Date()) {
  return DAY.format(now);
}

export function currentMonth(now = new Date()) {
  return todayIso(now).slice(0, 7);
}

export function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoFromUtc(date);
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split('-').map(Number);
  return isoFromUtc(new Date(Date.UTC(year, m - 1 + delta, 1))).slice(0, 7);
}

export function recentMonths(month: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, index - (count - 1)));
}

export function monthLabel(month: string) {
  const [year, m] = month.split('-');
  return `${year} 年 ${Number(m)} 月`;
}

function isoFromUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
