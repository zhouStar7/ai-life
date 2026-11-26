import type { Prisma, PrismaClient } from '@prisma/client';
import type { DataMode } from './databaseEnvironment.js';
import { ensureMemberData } from './members.js';
import { inferTripDates } from '../../shared/trips.js';
import { SEED_ALERTS, SEED_DEVICES, SEED_EXPENSES, SEED_ITEMS, SEED_MEALS, SEED_OUTFITS, SEED_RECIPES, SEED_TRIPS } from './seedData.js';

async function isEmpty(db: Prisma.TransactionClient) {
  if (await db.profile.count()) return false;
  const counts = await Promise.all([
    db.sessionState.count(), db.nutritionTarget.count(), db.budget.count(), db.notice.count(),
    db.wardrobeItem.count(), db.outfit.count(), db.meal.count(), db.recipe.count(), db.device.count(),
    db.alert.count(), db.trip.count(), db.expense.count(), db.packingTemplate.count(),
  ]);
  return counts.every((count) => count === 0);
}

export async function seedIfEmpty(db: PrismaClient, mode: DataMode = 'demo') {
  await db.$transaction(async (tx) => {
    const demo = mode === 'demo' && await isEmpty(tx);
    const local = { id: 'local' };
    await tx.profile.upsert({ where: local, create: { ...local, name: demo ? '星宇' : '' }, update: {} });
    await tx.sessionState.upsert({
      where: local,
      create: { ...local, weatherOn: demo, weatherLabel: demo ? '22°C 多云' : '' },
      update: {},
    });
    await ensureMemberData(tx, local.id, { demo });
    const members = await tx.member.findMany({ where: { id: { not: local.id } }, select: { id: true } });
    for (const { id } of members) await ensureMemberData(tx, id);
    if (demo) await seedDemoContent(tx);
  });
}

async function seedDemoContent(db: Prisma.TransactionClient) {
  await db.wardrobeItem.createMany({ data: SEED_ITEMS });
  await db.outfit.createMany({
    data: SEED_OUTFITS.map((outfit) => ({ ...outfit, itemIds: JSON.stringify(outfit.itemIds) })),
  });
  await db.meal.createMany({ data: SEED_MEALS });
  await db.recipe.createMany({
    data: SEED_RECIPES.map((recipe) => ({ ...recipe, tags: JSON.stringify(recipe.tags) })),
  });
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
      ...inferTripDates(trip.dateLabel, trip.timeline.map(({ time }) => time), '2026-09-01'),
      tickets: JSON.stringify(trip.tickets),
      timeline: JSON.stringify(trip.timeline),
      packing: JSON.stringify(trip.packing),
    })),
  });
  await db.expense.createMany({
    data: SEED_EXPENSES.map(({ amount, ...expense }) => ({ ...expense, amountCents: BigInt(amount) * 100n, tripId: 'tripId' in expense ? expense.tripId : '' })),
  });
}
