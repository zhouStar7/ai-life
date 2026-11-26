import type { PrismaClient } from '@prisma/client';
import { DEFAULT_HA_BASE } from './adapters/home-assistant.js';
import { readSceneBook } from './homeLink.js';
import { readJson } from './ids.js';
import { defaultSpendingMonth, spendingSummary } from '../../shared/spending.js';
import { localDate } from './localDate.js';
import { centsToYuan, expenseToYuan } from './money.js';

export async function readSnapshot(db: PrismaClient, selectedMonth = defaultSpendingMonth(localDate(), process.env.AI_LIFE_MODE === 'demo')) {
  const [items, outfits, meals, recipes, target, devices, alerts, trips, expenses, budget, notice, session, profile, packingTemplates] = await Promise.all([
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
    db.packingTemplate.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const liveHome = session.haConnected && Boolean(profile.haToken);
  const visibleDevices = Boolean(profile.haToken)
    ? devices.filter((device) => device.source === 'ha')
    : devices.filter((device) => device.source !== 'ha');

  return {
    items,
    outfits: outfits.map((outfit) => ({ ...outfit, itemIds: readJson<string[]>(outfit.itemIds, []) })),
    meals,
    recipes: recipes.map((recipe) => ({ ...recipe, tags: readJson<string[]>(recipe.tags, []) })),
    targets: { kcal: target.kcal, protein: target.protein, carb: target.carb, fat: target.fat },
    devices: visibleDevices.map((device) => ({
      id: device.id,
      name: device.name,
      room: device.room,
      kind: device.kind,
      on: device.on,
      paramLabel: device.paramLabel ?? undefined,
      paramValue: device.paramValue ?? undefined,
      offline: device.offline || undefined,
    })),
    alerts,
    trips: trips.map((trip) => ({
      ...trip,
      tickets: readJson(trip.tickets, []),
      timeline: readJson(trip.timeline, []),
      packing: readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []),
    })),
    expenses: expenses.map(expenseToYuan),
    packingTemplates: packingTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      items: readJson<string[]>(template.items, []),
    })),
    budgets: { total: centsToYuan(budget.totalCents), 衣: centsToYuan(budget.clothCents), 食: centsToYuan(budget.foodCents), 住: centsToYuan(budget.homeCents), 行: centsToYuan(budget.tripCents) },
    notices: { outfit: notice.outfit, budget: notice.budget, device: notice.device },
    suggestionIndex: session.suggestionIndex,
    weatherOn: session.weatherOn,
    weatherLabel: session.weatherLabel,
    weatherCity: session.weatherCity,
    weatherSource: session.weatherSource,
    weatherUpdatedAt: session.weatherUpdatedAt,
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
    home: {
      configured: Boolean(profile.haToken),
      baseUrl: profile.haBase || DEFAULT_HA_BASE,
      connected: liveHome,
      sceneCatalog: readSceneBook(session.haScenes).catalog,
      sceneBindings: readSceneBook(session.haScenes).bindings,
    },
    spending: spendingSummary(expenses, selectedMonth, (row) => row.amountCents),
  };
}

export type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
