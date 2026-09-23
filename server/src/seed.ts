import type { PrismaClient } from '@prisma/client';
import { SEED_ALERTS, SEED_DEVICES, SEED_EXPENSES, SEED_ITEMS, SEED_MEALS, SEED_OUTFITS, SEED_RECIPES, SEED_TRIPS } from './seedData.js';

export async function seedIfEmpty(db: PrismaClient) {
  const existing = await db.profile.findUnique({ where: { id: 'local' } });
  if (existing) return;
  await db.profile.create({ data: { id: 'local', name: '星宇', modelBase: '', modelName: '', modelKey: '' } });
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
  await db.wardrobeItem.createMany({ data: SEED_ITEMS });
  await db.outfit.createMany({
    data: SEED_OUTFITS.map((outfit) => ({ ...outfit, itemIds: JSON.stringify(outfit.itemIds) })),
  });
  await db.meal.createMany({ data: SEED_MEALS });
  await db.recipe.createMany({
    data: SEED_RECIPES.map((recipe) => ({ ...recipe, tags: JSON.stringify(recipe.tags) })),
  });
  await db.nutritionTarget.create({ data: { id: 'local', kcal: 1800, protein: 120, carb: 200, fat: 60 } });
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
      tickets: JSON.stringify(trip.tickets),
      timeline: JSON.stringify(trip.timeline),
      packing: JSON.stringify(trip.packing),
    })),
  });
  await db.expense.createMany({ data: SEED_EXPENSES });
  await db.budget.create({ data: { id: 'local', total: 10000, cloth: 2000, food: 3000, home: 1500, trip: 3500 } });
  await db.notice.create({ data: { id: 'local', outfit: true, budget: true, device: true } });
}
