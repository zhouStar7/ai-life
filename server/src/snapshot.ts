import type { PrismaClient } from '@prisma/client';
import { DEFAULT_HA_BASE } from './adapters/home-assistant.js';
import { readSceneBook } from './homeLink.js';
import { readJson } from './ids.js';
import { defaultSpendingMonth, spendingSummary } from '../../shared/spending.js';
import { localDate } from './localDate.js';
import { centsToYuan, expenseToYuan } from './money.js';
import { coverUrl } from './photos.js';
import { currentMemberId } from './requestContext.js';
import { tripStatus } from '../../shared/trips.js';

export async function readSnapshot(db: PrismaClient, selectedMonth = defaultSpendingMonth(localDate(), process.env.AI_LIFE_MODE === 'demo')) {
  const owner = { memberId: currentMemberId() };
  const [items, outfits, meals, recipes, target, devices, alerts, trips, expenses, budget, notice, session, state, profile, packingTemplates] = await Promise.all([
    db.wardrobeItem.findMany({ where: owner, orderBy: { createdAt: 'desc' } }),
    db.outfit.findMany({ where: owner }),
    db.meal.findMany({ where: owner }),
    db.recipe.findMany({ where: owner }),
    db.nutritionTarget.findUniqueOrThrow({ where: owner }),
    db.device.findMany(),
    db.alert.findMany(),
    db.trip.findMany({ where: owner }),
    db.expense.findMany({ where: owner, orderBy: { date: 'desc' } }),
    db.budget.findUniqueOrThrow({ where: owner }),
    db.notice.findUniqueOrThrow({ where: owner }),
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
    db.memberState.findUniqueOrThrow({ where: owner }),
    db.profile.findUniqueOrThrow({ where: { id: 'local' } }),
    db.packingTemplate.findMany({ where: owner, orderBy: { name: 'asc' } }),
  ]);

  const liveHome = session.haConnected && Boolean(profile.haToken);
  const visibleDevices = Boolean(profile.haToken)
    ? devices.filter((device) => device.source === 'ha')
    : devices.filter((device) => device.source !== 'ha');

  return {
    items: items.map(({ memberId: _memberId, cover, priceCents, ...item }) => ({
      ...item, cover: coverUrl(item.id, cover), price: priceCents === null ? null : centsToYuan(priceCents),
    })),
    outfits: outfits.map(({ memberId: _memberId, itemIds, ...outfit }) => ({ ...outfit, itemIds: readJson<string[]>(itemIds, []) })),
    meals: meals.map(({ memberId: _memberId, ...meal }) => meal),
    recipes: recipes.map(({ memberId: _memberId, tags, ...recipe }) => ({ ...recipe, tags: readJson<string[]>(tags, []) })),
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
    trips: trips.map(({ memberId: _memberId, ...trip }) => ({
      ...trip,
      status: tripStatus(trip, localDate()),
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
    suggestionIndex: state.suggestionIndex,
    weatherOn: session.weatherOn,
    weatherLabel: session.weatherLabel,
    weatherCity: session.weatherCity,
    weatherSource: session.weatherSource,
    weatherUpdatedAt: session.weatherUpdatedAt,
    outfitAdopted: state.outfitAdopted,
    activeOutfitId: state.activeOutfitId,
    activeScene: session.activeScene,
    activeTripId: state.activeTripId,
    adoptedTips: readJson<string[]>(state.adoptedTips, []),
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
