import type { Prisma } from '@prisma/client';
import { uid } from './ids.js';
import { LOCAL_MEMBER_ID } from './requestContext.js';

export async function ensureMemberData(db: Prisma.TransactionClient, memberId: string, seed?: { demo: boolean }) {
  const key = { memberId };
  const local = memberId === LOCAL_MEMBER_ID;
  const seeded = local && seed !== undefined;
  const id = { id: memberId };
  // A migrated singleton can have an ID owned by another account, including `local`.
  // Select each target by owner and generate a fresh ID if its default is taken.
  const [target, budget, notice] = await Promise.all([
    db.nutritionTarget.findUnique({ where: id, select: keySelect }),
    db.budget.findUnique({ where: id, select: keySelect }),
    db.notice.findUnique({ where: id, select: keySelect }),
  ]);
  await db.memberState.upsert({ where: key, create: { ...key, activeTripId: seeded && seed.demo ? 't-bj' : '' }, update: {} });
  await db.nutritionTarget.upsert({
    where: key,
    create: { ...key, id: target ? uid('target') : memberId, kcal: seeded ? 1800 : 0, protein: seeded ? 120 : 0, carb: seeded ? 200 : 0, fat: seeded ? 60 : 0 },
    update: {},
  });
  await db.budget.upsert({
    where: key,
    create: { ...key, id: budget ? uid('budget') : memberId, totalCents: seeded ? 1_000_000n : 0n, clothCents: seeded ? 200_000n : 0n, foodCents: seeded ? 300_000n : 0n, homeCents: seeded ? 150_000n : 0n, tripCents: seeded ? 350_000n : 0n },
    update: {},
  });
  await db.notice.upsert({
    where: key,
    create: { ...key, id: notice ? uid('notice') : memberId, outfit: true, budget: true, device: true },
    update: {},
  });
}

const keySelect = { memberId: true };
