import type { PrismaClient } from '@prisma/client';
import { readJson } from './ids.js';
import { PAST_TREND } from './seedData.js';

export async function readSnapshot(db: PrismaClient) {
  const [items, outfits, meals, recipes, target, devices, alerts, trips, expenses, budget, notice, session, profile] = await Promise.all([
    db.wardrobeItem.findMany({ orderBy: { createdAt: 'desc' } }),
    db.outfit.findMany(),
    db.meal.findMany(),
    db.recipe.findMany(),
    db.nutritionTarget.findUniqueOrThrow({ where: { id: 'local' } }),
    db.device.findMany(),
    db.alert.findMany(),
    db.trip.findMany(),
    db.expense.findMany({ orderBy: { date: 'desc' } }),
    db.budget.findUniqueOrThrow({ where: { id: 'local' } }),
    db.notice.findUniqueOrThrow({ where: { id: 'local' } }),
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
    db.profile.findUniqueOrThrow({ where: { id: 'local' } }),
  ]);

  const month = expenses.filter((item) => item.date.startsWith('2026-09'));
  const total = month.reduce((sum, item) => sum + item.amount, 0);
  const byTag = (tag: string) => month.filter((item) => item.tag === tag).reduce((sum, item) => sum + item.amount, 0);

  return {
    items,
    outfits: outfits.map((outfit) => ({ ...outfit, itemIds: readJson<string[]>(outfit.itemIds, []) })),
    meals,
    recipes: recipes.map((recipe) => ({ ...recipe, tags: readJson<string[]>(recipe.tags, []) })),
    targets: { kcal: target.kcal, protein: target.protein, carb: target.carb, fat: target.fat },
    devices: devices.map((device) => ({
      ...device,
      paramLabel: device.paramLabel ?? undefined,
      paramValue: device.paramValue ?? undefined,
      offline: device.offline || undefined,
    })),
    alerts,
    trips: trips.map((trip) => ({
      ...trip,
      tickets: readJson(trip.tickets, []),
      timeline: readJson(trip.timeline, []),
      packing: readJson(trip.packing, []),
    })),
    expenses,
    budgets: { total: budget.total, 衣: budget.cloth, 食: budget.food, 住: budget.home, 行: budget.trip },
    notices: { outfit: notice.outfit, budget: notice.budget, device: notice.device },
    suggestionIndex: session.suggestionIndex,
    weatherOn: session.weatherOn,
    weatherLabel: session.weatherLabel,
    outfitAdopted: session.outfitAdopted,
    activeOutfitId: session.activeOutfitId,
    activeScene: session.activeScene,
    activeTripId: session.activeTripId,
    adoptedTips: readJson<string[]>(session.adoptedTips, []),
    model: {
      configured: Boolean(profile.modelBase),
      baseUrl: profile.modelBase,
      model: profile.modelName,
    },
    spending: {
      monthTotal: total,
      byTag: { 衣: byTag('衣'), 食: byTag('食'), 住: byTag('住'), 行: byTag('行') },
      trend: [...PAST_TREND, { label: '9月', amount: total }],
    },
  };
}

export type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
