import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayIso } from '../calendar.js';
import { applyNamedScene } from '../homeLink.js';
import { readJson, uid } from '../ids.js';
import { toCents } from '../money.js';
import { readSnapshot } from '../snapshot.js';
import { pickRecipe } from '../dietPlan.js';
import { planOutfit } from '../wardrobePlan.js';
import { CROSS_ACTIONS, type Action } from './actions.js';

type Tx = Prisma.TransactionClient;

export type ActionResult = {
  type: Action['type'];
  status: 'done' | 'failed' | 'skipped';
  via?: 'local' | 'home-assistant';
  error?: string;
};

type Patch = {
  tips: string[];
  outfitAdopted: boolean;
  activeTripId: string;
  suggestionIndex: number;
  weatherOn: boolean;
};

function withTip(tips: string[], id: string) {
  return tips.includes(id) ? tips : [...tips, id];
}

function fingerprint(memberId: string, key: string, action: Action) {
  return createHash('sha256').update(`${memberId}\n${key}\n${JSON.stringify(action)}`).digest('hex');
}

export async function adopt(db: PrismaClient, memberId: string, key: string | undefined, actions: Action[], provided = false) {
  const [session, state] = await Promise.all([
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
    db.memberState.findUniqueOrThrow({ where: { memberId } }),
  ]);
  const tips = readJson<string[]>(state.adoptedTips, []);
  const personal = { ...state, weatherOn: session.weatherOn, weatherLabel: session.weatherLabel };
  const batch = provided || actions.length > 0 ? actions : key === 'cross' ? CROSS_ACTIONS : await preset(db, memberId, key, personal);
  const adopted = Boolean(key && tips.includes(key));
  const local = adopted
    ? batch.filter((action) => action.type !== 'apply_scene').map((action) => ({ type: action.type, status: 'skipped' as const }))
    : await writeLocal(db, memberId, key, batch, personal);
  const scenes = [];
  for (const action of batch) {
    if (action.type !== 'apply_scene') continue;
    scenes.push(await runScene(db, memberId, key ?? '', action));
  }
  const results = merge(batch, local, scenes);
  return { snapshot: await readSnapshot(db, memberId), results };
}

async function writeLocal(
  db: PrismaClient,
  memberId: string,
  key: string | undefined,
  batch: Action[],
  session: { outfitAdopted: boolean; activeTripId: string; suggestionIndex: number; weatherOn: boolean; adoptedTips: string },
) {
  const patch: Patch = {
    tips: readJson<string[]>(session.adoptedTips, []),
    outfitAdopted: session.outfitAdopted,
    activeTripId: session.activeTripId,
    suggestionIndex: session.suggestionIndex,
    weatherOn: session.weatherOn,
  };
  const local: ActionResult[] = [];
  await db.$transaction(async (tx) => {
    for (const action of batch) {
      if (action.type === 'apply_scene') continue;
      const fp = fingerprint(memberId, key ?? '', action);
      const prior = await tx.actionRun.findUnique({ where: { fingerprint: fp } });
      if (prior?.status === 'done') {
        local.push({ type: action.type, status: 'skipped' });
        continue;
      }
      const applied = await applyLocal(tx, memberId, action, patch, key);
      await tx.actionRun.create({
        data: { id: uid('run'), fingerprint: fp, type: action.type, status: 'done', detail: applied },
      });
      local.push({ type: action.type, status: applied === 'skipped' ? 'skipped' : 'done' });
    }
    if (key === 'cross') {
      patch.suggestionIndex = 1;
      patch.weatherOn = true;
      patch.outfitAdopted = true;
      patch.tips = withTip(withTip(withTip(withTip(patch.tips, 'outfit'), 'protein'), 'prep'), 'filter');
      patch.tips = withTip(patch.tips, 'cross');
    } else if (key) {
      patch.tips = withTip(patch.tips, key);
    }
    await tx.memberState.update({
      where: { memberId },
      data: {
        adoptedTips: JSON.stringify(patch.tips),
        outfitAdopted: patch.outfitAdopted,
        activeTripId: patch.activeTripId,
        suggestionIndex: patch.suggestionIndex,
      },
    });
    await tx.sessionState.update({ where: { id: 'local' }, data: { weatherOn: patch.weatherOn } });
  });
  return local;
}

async function applyLocal(tx: Tx, memberId: string, action: Action, patch: Patch, key: string | undefined) {
  if (action.type === 'adopt_outfit') {
    await tx.wardrobeItem.updateMany({ where: { id: { in: action.itemIds }, memberId }, data: { wears: { increment: 1 } } });
    patch.outfitAdopted = true;
    patch.tips = withTip(patch.tips, 'outfit');
    return 'done';
  }
  if (action.type === 'add_meal') {
    const id = action.id ?? uid('m');
    const exists = await tx.meal.findFirst({ where: { memberId, OR: [{ id }, { name: action.name }] } });
    if (exists) return 'skipped';
    await tx.meal.create({
      data: {
        id,
        memberId,
        slot: action.slot,
        name: action.name,
        time: action.time,
        date: todayIso(),
        kcal: action.kcal,
        protein: action.protein,
        carb: action.carb,
        fat: action.fat,
      },
    });
    if (key === 'protein' || key === 'cross' || action.name.includes('鸡胸')) patch.tips = withTip(patch.tips, 'protein');
    return 'done';
  }
  if (action.type === 'append_packing') {
    const trip = await tx.trip.findFirst({ where: { id: action.tripId, memberId } });
    if (!trip) return 'skipped';
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    const owned = new Set(packing.map((item) => item.text));
    for (const text of action.items) {
      if (!owned.has(text)) packing.push({ id: uid('p'), text, done: false });
    }
    await tx.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(packing), prepAdopted: true } });
    patch.activeTripId = trip.id;
    patch.tips = withTip(patch.tips, 'prep');
    return 'done';
  }
  if (action.type === 'add_expense') {
    const id = action.id ?? uid('e');
    const exists = await tx.expense.findFirst({ where: { id, memberId } });
    if (exists) return 'skipped';
    await tx.expense.create({
      data: {
        id,
        memberId,
        tag: action.tag,
        amount: toCents(action.amount),
        date: action.date || todayIso(),
        merchant: action.merchant,
        note: action.note,
      },
    });
    return 'done';
  }
  if (action.type === 'handle_alert') {
    await tx.alert.updateMany({ where: { id: action.id }, data: { handled: true } });
    if (action.id === 'a-filter') patch.tips = withTip(patch.tips, 'filter');
    return 'done';
  }
  return 'skipped';
}

async function runScene(db: PrismaClient, memberId: string, key: string, action: Extract<Action, { type: 'apply_scene' }>): Promise<ActionResult> {
  const fp = fingerprint(memberId, key, action);
  const prior = await db.actionRun.findUnique({ where: { fingerprint: fp } });
  if (prior?.status === 'done') {
    const via = prior.detail === 'home-assistant' || prior.detail === 'local' ? prior.detail : undefined;
    return { type: 'apply_scene', status: 'skipped', via };
  }
  const before = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  try {
    const scene = await applyNamedScene(db, action.name);
    const after = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const failed = before.haConnected && !after.haConnected;
    await remember(db, fp, failed ? 'failed' : 'done', failed ? 'home_unavailable' : scene.via);
    if (failed) return { type: 'apply_scene', status: 'failed', error: 'home_unavailable' };
    if (action.name === '离家') await rememberTip(db, memberId, 'prep');
    return { type: 'apply_scene', status: 'done', via: scene.via };
  } catch {
    await remember(db, fp, 'failed', 'scene_failed');
    return { type: 'apply_scene', status: 'failed', error: 'scene_failed' };
  }
}

async function remember(db: PrismaClient, fp: string, status: string, detail: string) {
  await db.actionRun.upsert({
    where: { fingerprint: fp },
    create: { id: uid('run'), fingerprint: fp, type: 'apply_scene', status, detail },
    update: { status, detail },
  });
}

async function rememberTip(db: PrismaClient, memberId: string, id: string) {
  const state = await db.memberState.findUniqueOrThrow({ where: { memberId } });
  const tips = withTip(readJson<string[]>(state.adoptedTips, []), id);
  await db.memberState.update({ where: { memberId }, data: { adoptedTips: JSON.stringify(tips) } });
}

function merge(batch: Action[], local: ActionResult[], scenes: ActionResult[]) {
  const results: ActionResult[] = [];
  let localIndex = 0;
  let sceneIndex = 0;
  for (const action of batch) {
    if (action.type === 'apply_scene') results.push(scenes[sceneIndex++]);
    else results.push(local[localIndex++]);
  }
  return results;
}

async function preset(db: PrismaClient, memberId: string, key: string | undefined, session: { suggestionIndex: number; weatherOn: boolean; weatherLabel: string }): Promise<Action[]> {
  if (key === 'outfit') {
    const items = await db.wardrobeItem.findMany({ where: { memberId } });
    return [{ type: 'adopt_outfit', itemIds: planOutfit(items, session.suggestionIndex, session.weatherOn, session.weatherLabel).itemIds }];
  }
  if (key === 'protein') {
    const today = todayIso();
    const [recipes, meals, target] = await Promise.all([
      db.recipe.findMany({ where: { memberId } }),
      db.meal.findMany({ where: { memberId } }),
      db.nutritionTarget.findUniqueOrThrow({ where: { memberId } }),
    ]);
    const picked = pickRecipe(
      recipes.map((recipe) => ({ ...recipe, tags: readJson<string[]>(recipe.tags, []) })),
      meals.filter((meal) => meal.date === today),
      target,
    );
    if (!picked) return [];
    return [{ type: 'add_meal', slot: picked.slot || '加餐', name: picked.name, time: '18:30', kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat }];
  }
  if (key === 'filter') return [{ type: 'handle_alert', id: 'a-filter' }];
  return [];
}
