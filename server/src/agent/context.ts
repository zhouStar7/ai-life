import type { PrismaClient } from '@prisma/client';
import { readJson } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

export async function buildContext(db: PrismaClient) {
  const snap = await readSnapshot(db);
  const protein = snap.meals.reduce((sum, meal) => sum + meal.protein, 0);
  const kcal = snap.meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const upcoming = snap.trips.find((trip) => trip.status === '即将开始') ?? snap.trips[0];
  const packing = upcoming?.packing ?? [];
  const openAlerts = snap.alerts.filter((alert) => !alert.handled).map((alert) => alert.title);
  return {
    weatherOn: snap.weatherOn,
    weatherLabel: snap.weatherLabel,
    items: snap.items.map((item) => ({ id: item.id, name: item.name, category: item.category, color: item.color, occasion: item.occasion, wears: item.wears })),
    kcal,
    protein,
    proteinGap: Math.max(0, snap.targets.protein - protein),
    alerts: openAlerts,
    trip: upcoming ? { id: upcoming.id, title: upcoming.title, missing: packing.filter((item) => !item.done).map((item) => item.text) } : null,
    spend: snap.spending.byTag,
    budgetLeft: snap.budgets.total - snap.spending.monthTotal,
  };
}

export function contextText(summary: Awaited<ReturnType<typeof buildContext>>) {
  return [
    `天气：${summary.weatherOn ? summary.weatherLabel : '没有天气，穿搭按通勤场合'}`,
    `衣橱：${summary.items.map((item) => `${item.id} ${item.name}/${item.color}/${item.occasion}/穿过${item.wears}`).join('；')}`,
    `今日热量 ${summary.kcal}，蛋白质缺口 ${summary.proteinGap} g`,
    `未处理提醒：${summary.alerts.join('、') || '无'}`,
    `即将出行：${summary.trip ? `${summary.trip.id} ${summary.trip.title}，未勾 ${summary.trip.missing.join('、') || '无'}` : '无'}`,
    `本月支出 ${JSON.stringify(summary.spend)}，预算剩余 ${summary.budgetLeft}`,
  ].join('\n');
}

export { readJson };
