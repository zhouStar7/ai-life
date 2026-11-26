import { currentMonth, monthLabel, recentMonths, shiftMonth, todayIso } from './calendar';
import type { Expense, SpendTag, WardrobeItem } from './types';

export { currentMonth, monthLabel, shiftMonth };

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function todayLabel(now = new Date()) {
  const [year, month, day] = todayIso(now).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}月${day}日 周${WEEK[date.getDay()]}`;
}

export function yuan(amount: number) {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.trunc(cents / 100).toLocaleString('zh-CN');
  const frac = cents % 100;
  const text = frac === 0 ? whole : `${whole}.${String(frac).padStart(2, '0')}`;
  return `${amount < 0 ? '-' : ''}¥${text}`;
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function percentChange(current: number, prev: number) {
  if (prev <= 0) return 0;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

export function share(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function monthExpenses(expenses: Expense[], tag?: SpendTag, month = currentMonth()) {
  return expenses.filter((item) => item.date.startsWith(month) && (!tag || item.tag === tag));
}

export function sumAmount(expenses: Expense[]) {
  return expenses.reduce((sum, item) => sum + item.amount, 0);
}

export function spendTrend(expenses: Expense[], month = currentMonth()) {
  return recentMonths(month, 6).map((item) => ({
    month: item,
    label: `${Number(item.slice(5))}月`,
    amount: sumAmount(expenses.filter((row) => row.date.startsWith(item))),
  }));
}

export function colorHex(color: string) {
  const map: Record<string, string> = {
    白色: '#F8FAFC',
    深蓝: '#1E3A8A',
    米色: '#E4CFA3',
    黑色: '#111827',
    碎花: '#F472B6',
    灰色: '#94A3B8',
    蓝色: '#3B82F6',
    卡其: '#C2A878',
    藏青: '#1E293B',
  };
  return map[color] ?? '#CBD5E1';
}

export function itemNames(items: WardrobeItem[], ids: string[]) {
  return ids
    .map((id) => items.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}
