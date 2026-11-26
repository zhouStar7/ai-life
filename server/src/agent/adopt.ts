import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { yuanToCents } from '../money.js';
import { readJson, uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';
import { localDate } from '../localDate.js';
import { pickRecipe } from '../dietPlan.js';
import { planOutfit } from '../wardrobePlan.js';
import { currentMemberId } from '../requestContext.js';
import type { Action } from './actions.js';

type ActionResult = { type: Action['type']; status: 'done' | 'skipped'; error?: string };

export async function adopt(db: PrismaClient, key: string | undefined, actions: Action[] | undefined, demo: boolean) {
  const memberId = currentMemberId();
  const results = await db.$transaction(async (tx) => {
    const state = await tx.memberState.findUniqueOrThrow({ where: { memberId } });
    const tips = new Set(readJson<string[]>(state.adoptedTips, []));
    const batch = actions ?? await preset(tx, key, state.suggestionIndex);
    let { outfitAdopted, activeTripId } = state;
    const results: ActionResult[] = [];
    for (const action of batch) {
      if (action.type === 'apply_scene') {
        results.push({ type: action.type, status: 'skipped', error: 'confirmation_required' });
        continue;
      }
      const fingerprint = createHash('sha256').update(`${memberId}\n${key ?? ''}\n${JSON.stringify(action)}`).digest('hex');
      if (await tx.actionRun.findUnique({ where: { fingerprint } }) || (!actions && key && tips.has(key))) {
        results.push({ type: action.type, status: 'skipped' });
        continue;
      }
      const applied = await applyAction(tx, action, demo ? null : memberId);
      if (applied && action.type === 'adopt_outfit') { outfitAdopted = true; tips.add('outfit'); }
      if (applied && action.type === 'add_meal' && (key === 'protein' || action.name.includes('鸡胸'))) tips.add('protein');
      if (applied && action.type === 'append_packing') { activeTripId = action.tripId; tips.add('prep'); }
      if (applied && action.type === 'handle_alert' && action.id === 'a-filter') tips.add('filter');
      const status = applied ? 'done' : 'skipped';
      await tx.actionRun.create({ data: { id: uid('run'), fingerprint, type: action.type, status: 'done', detail: status } });
      results.push({ type: action.type, status });
    }
    if (results.some((item) => item.status === 'done')) {
      if (key) tips.add(key);
      await tx.memberState.update({ where: { memberId }, data: { adoptedTips: JSON.stringify([...tips]), outfitAdopted, activeTripId } });
    }
    return results;
  });
  return { snapshot: await readSnapshot(db), results };
}

function actionId(prefix: string, id: string | undefined, memberId: string | null) {
  if (!id) return uid(prefix);
  if (!memberId) return id;
  return `${prefix}-${createHash('sha256').update(JSON.stringify([memberId, id])).digest('hex')}`;
}

async function applyAction(tx: Prisma.TransactionClient, action: Exclude<Action, { type: 'apply_scene' }>, memberId: string | null) {
  if (action.type === 'adopt_outfit') {
    const ids = [...new Set(action.itemIds)];
    const items = await tx.wardrobeItem.count({ where: { id: { in: ids } } });
    if (!ids.length || items !== ids.length) return false;
    await tx.wardrobeItem.updateMany({ where: { id: { in: ids } }, data: { wears: { increment: 1 } } });
    return true;
  }
  if (action.type === 'add_meal') {
    const { type: _, id: suppliedId, ...meal } = action;
    const id = actionId('m', suppliedId, memberId);
    const date = localDate();
    if (await tx.meal.findFirst({ where: { OR: [{ id }, { name: meal.name, date }] } })) return false;
    await tx.meal.create({ data: { ...meal, id, date } });
    return true;
  }
  if (action.type === 'append_packing') {
    const trip = await tx.trip.findUnique({ where: { id: action.tripId } });
    if (!trip) return false;
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    const owned = new Set(packing.map((item) => item.text));
    for (const text of new Set(action.items)) {
      if (!owned.has(text)) packing.push({ id: uid('p'), text, done: false });
    }
    await tx.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(packing), prepAdopted: true } });
    return true;
  }
  if (action.type === 'add_expense') {
    const amountCents = yuanToCents(action.amount);
    const id = actionId('e', action.id, memberId);
    if (!amountCents || await tx.expense.findUnique({ where: { id } })) return false;
    await tx.expense.create({ data: { id, tag: action.tag, amountCents, date: action.date, merchant: action.merchant, note: action.note } });
    return true;
  }
  const updated = await tx.alert.updateMany({ where: { id: action.id, handled: false }, data: { handled: true } });
  return updated.count > 0;
}

async function preset(db: Prisma.TransactionClient, key: string | undefined, suggestionIndex: number): Promise<Action[]> {
  if (key === 'outfit') {
    const [items, session] = await Promise.all([
      db.wardrobeItem.findMany(),
      db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
    ]);
    return [{ type: 'adopt_outfit', itemIds: planOutfit(items, suggestionIndex, session.weatherOn, session.weatherLabel).itemIds }];
  }
  if (key === 'protein') {
    const [recipes, meals, target] = await Promise.all([
      db.recipe.findMany(),
      db.meal.findMany({ where: { date: localDate() } }),
      db.nutritionTarget.findUniqueOrThrow({ where: { memberId: currentMemberId() } }),
    ]);
    const picked = pickRecipe(recipes, meals, target);
    if (!picked) return [];
    return [{ type: 'add_meal', slot: picked.slot, name: picked.name, time: '18:30', kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat }];
  }
  if (key === 'filter') return [{ type: 'handle_alert', id: 'a-filter' }];
  return [];
}
