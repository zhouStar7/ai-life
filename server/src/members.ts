import type { PrismaClient } from '@prisma/client';

export async function ensureMemberData(db: PrismaClient, memberId: string) {
  await db.memberState.upsert({ where: { memberId }, create: { memberId }, update: {} });
  await db.nutritionTarget.upsert({
    where: { memberId },
    create: { id: memberId, memberId, kcal: 0, protein: 0, carb: 0, fat: 0 },
    update: {},
  });
  await db.budget.upsert({
    where: { memberId },
    create: { id: memberId, memberId, total: 0, cloth: 0, food: 0, home: 0, trip: 0 },
    update: {},
  });
  await db.notice.upsert({
    where: { memberId },
    create: { id: memberId, memberId, outfit: true, budget: true, device: true },
    update: {},
  });
}
