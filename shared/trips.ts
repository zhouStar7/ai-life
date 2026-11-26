export type TripDates = { startDate?: string | null; endDate?: string | null };
export type TripStatus = '日期待定' | '即将开始' | '进行中' | '已结束';

type DateParts = { year: number | null; month: number; day: number };

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatDate(year: number, { month, day }: DateParts) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateParts(text: string): DateParts[] {
  const matches = text.matchAll(/(?<![\w./-])(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d./-])|(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日|(\d{1,2})[-/](\d{1,2})(?![\d./-]))/g);
  return Array.from(matches, ([, isoYear, isoMonth, isoDay, chineseYear, chineseMonth, chineseDay, shortMonth, shortDay]) => ({
    year: Number(isoYear ?? chineseYear) || null,
    month: Number(isoMonth ?? chineseMonth ?? shortMonth),
    day: Number(isoDay ?? chineseDay ?? shortDay),
  })).filter(parts => validDate(formatDate(parts.year ?? 2000, parts)));
}

function resolveDates(parts: DateParts[], anchor: DateParts | undefined, referenceYear: number) {
  if (!parts.length) return [];
  const explicit = parts.findIndex(date => date.year !== null);
  const start = Math.max(0, explicit);
  const initial = parts[explicit] ?? anchor ?? parts[0];
  let year = initial.year ?? referenceYear;
  let month = initial.month;
  if (explicit === -1 && parts[0].month - month > 6) year--;
  const dates = parts.slice(start).map(part => {
    year = part.year ?? (year + (month - part.month > 6 ? 1 : 0));
    month = part.month;
    return formatDate(year, part);
  });
  if (explicit > 0) {
    year = parts[explicit].year!;
    month = parts[explicit].month;
    for (const part of parts.slice(0, explicit).reverse()) {
      if (part.month - month > 6) year--;
      month = part.month;
      dates.unshift(formatDate(year, part));
    }
  }
  return dates.filter(validDate);
}

export function inferTripDates(label: string, times: string[], reference: string): Required<TripDates> {
  const labelParts = dateParts(label);
  const timeParts = times.flatMap(dateParts);
  const referenceYear = Number(reference.slice(0, 4));
  const explicit = labelParts.find(date => date.year !== null) ?? timeParts.find(date => date.year !== null);
  const first = labelParts[0] ?? timeParts[0];
  const anchor = explicit ?? (first && { ...first, year: referenceYear });
  const dates = [...resolveDates(labelParts, anchor, referenceYear), ...resolveDates(timeParts, anchor, referenceYear)].sort();
  return { startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null };
}

export function tripStatus({ startDate, endDate }: TripDates, today: string): TripStatus {
  if (!startDate || !endDate) return '日期待定';
  if (endDate < today) return '已结束';
  if (startDate > today) return '即将开始';
  return '进行中';
}

export function tripDateLabel({ startDate, endDate }: TripDates) {
  if (!startDate) return endDate || '日期待定';
  return endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;
}
