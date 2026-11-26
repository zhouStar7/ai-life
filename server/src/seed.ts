import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './auth.js';
import { todayIso } from './calendar.js';
import { toCents } from './money.js';
import { SEED_ALERTS, SEED_DEVICES, SEED_EXPENSES, SEED_ITEMS, SEED_MEALS, SEED_OUTFITS, SEED_RECIPES, SEED_TRIPS } from './seedData.js';

const DEMO_MEMBER = 'm-xingyu';

export async function seedIfEmpty(db: PrismaClient) {
  const existing = await db.profile.findUnique({ where: { id: 'local' } });
  if (existing) return;
  await db.profile.create({ data: { id: 'local', name: '星宇', modelBase: '', modelName: '', modelKey: '', moneyCents: true } });
  await db.member.create({
    data: {
      id: DEMO_MEMBER,
      username: 'xingyu',
      name: '星宇',
      passwordHash: await hashPassword('life-local'),
      createdAt: todayIso(),
    },
  });
  await db.memberState.create({
    data: { memberId: DEMO_MEMBER, suggestionIndex: 0, activeTripId: 't-bj', adoptedTips: '[]' },
  });
  await db.sessionState.create({
    data: {
      id: 'local',
      suggestionIndex: 0,
      weatherOn: true,
      weatherLabel: '22°C 多云',
      outfitAdopted: false,
      activeTripId: 't-bj',
      adoptedTips: '[]',
    },
  });
  await db.wardrobeItem.createMany({ data: SEED_ITEMS.map((item) => ({ ...item, memberId: DEMO_MEMBER })) });
  await db.outfit.createMany({
    data: SEED_OUTFITS.map((outfit) => ({ ...outfit, memberId: DEMO_MEMBER, itemIds: JSON.stringify(outfit.itemIds) })),
  });
  await db.meal.createMany({ data: SEED_MEALS.map((meal) => ({ ...meal, memberId: DEMO_MEMBER })) });
  await db.recipe.createMany({
    data: SEED_RECIPES.map((recipe) => ({ ...recipe, memberId: DEMO_MEMBER, tags: JSON.stringify(recipe.tags) })),
  });
  await db.nutritionTarget.create({ data: { id: 'local', memberId: DEMO_MEMBER, kcal: 1800, protein: 120, carb: 200, fat: 60 } });
  await db.device.createMany({
    data: SEED_DEVICES.map((device) => ({
      ...device,
      paramLabel: device.paramLabel ?? null,
      paramValue: device.paramValue ?? null,
      offline: device.offline ?? false,
    })),
  });
  await db.alert.createMany({ data: SEED_ALERTS });
  await db.trip.createMany({
    data: SEED_TRIPS.map((trip) => ({
      ...trip,
      memberId: DEMO_MEMBER,
      tickets: JSON.stringify(trip.tickets),
      timeline: JSON.stringify(trip.timeline),
      packing: JSON.stringify(trip.packing),
    })),
  });
  await db.expense.createMany({
    data: SEED_EXPENSES.map((expense) => ({
      ...expense,
      memberId: DEMO_MEMBER,
      amount: toCents(expense.amount),
      tripId: 'tripId' in expense ? expense.tripId : '',
    })),
  });
  await db.budget.create({ data: { id: 'local', memberId: DEMO_MEMBER, total: 10000, cloth: 2000, food: 3000, home: 1500, trip: 3500 } });
  await db.notice.create({ data: { id: 'local', memberId: DEMO_MEMBER, outfit: true, budget: true, device: true } });
}

export async function migrateMembers(db: PrismaClient) {
  if ((await db.member.count()) > 0) return;
  const profile = await db.profile.findUnique({ where: { id: 'local' } });
  const session = await db.sessionState.findUnique({ where: { id: 'local' } });
  await db.member.create({
    data: {
      id: DEMO_MEMBER,
      username: 'xingyu',
      name: profile?.name || '星宇',
      passwordHash: await hashPassword('life-local'),
      createdAt: todayIso(),
    },
  });
  await db.memberState.create({
    data: {
      memberId: DEMO_MEMBER,
      suggestionIndex: session?.suggestionIndex ?? 0,
      outfitAdopted: session?.outfitAdopted ?? false,
      activeOutfitId: session?.activeOutfitId,
      activeTripId: session?.activeTripId || 't-bj',
      adoptedTips: session?.adoptedTips ?? '[]',
    },
  });
  await db.wardrobeItem.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.outfit.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.meal.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.recipe.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.trip.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.expense.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.packingTemplate.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.nutritionTarget.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.budget.updateMany({ data: { memberId: DEMO_MEMBER } });
  await db.notice.updateMany({ data: { memberId: DEMO_MEMBER } });
}

export async function migrateMoneyToCents(db: PrismaClient) {
  const profile = await db.profile.findUnique({ where: { id: 'local' } });
  if (!profile || profile.moneyCents) return;
  const expenses = await db.expense.findMany();
  await db.$transaction([
    ...expenses.map((expense) => db.expense.update({
      where: { id: expense.id },
      data: { amount: toCents(expense.amount) },
    })),
    db.profile.update({ where: { id: 'local' }, data: { moneyCents: true } }),
  ]);
}
