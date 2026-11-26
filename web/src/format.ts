import type { Expense, SpendTag, WardrobeItem } from './types';

import { defaultSpendingMonth } from '../../shared/spending';
import { localDate } from './localDate';

export function reportMonth(today = localDate()) {
  return defaultSpendingMonth(today, import.meta.env.VITE_AI_LIFE_MODE === 'demo');
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function todayLabel() {
  const day = new Date();
  return `${day.getMonth() + 1}月${day.getDate()}日 周${WEEK[day.getDay()]}`;
}

export function yuan(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function monthExpenses(expenses: Expense[], tag?: SpendTag, month = reportMonth()) {
  return expenses.filter((item) => item.date.startsWith(`${month}-`) && (!tag || item.tag === tag));
}

export function sumAmount(expenses: Expense[]) {
  return expenses.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
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
