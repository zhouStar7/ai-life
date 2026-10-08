import type { PrismaClient } from '@prisma/client';
import { readJson, uid } from '../ids.js';
import { nextDevice } from '../scenes.js';
import { readSnapshot } from '../snapshot.js';
import { pickRecipe } from '../dietPlan.js';
import { pickSuggestion } from '../suggestion.js';
import { CROSS_ACTIONS, type Action } from './actions.js';

function withTip(tips: string[], id: string) {
  return tips.includes(id) ? tips : [...tips, id];
}

export async function adopt(db: PrismaClient, key: string | undefined, actions: Action[]) {
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  let tips = readJson<string[]>(session.adoptedTips, []);
  const batch = actions.length > 0 ? actions : key === 'cross' ? CROSS_ACTIONS : await preset(db, key, session);
  if (key && tips.includes(key)) return readSnapshot(db);
  if (key === 'outfit' && session.outfitAdopted) return readSnapshot(db);

  let outfitAdopted = session.outfitAdopted;
  let activeScene = session.activeScene;
  let activeTripId = session.activeTripId;
  let suggestionIndex = session.suggestionIndex;
  let weatherOn = session.weatherOn;

  for (const action of batch) {
    if (action.type === 'adopt_outfit') {
      const ids = action.itemIds;
      await db.wardrobeItem.updateMany({ where: { id: { in: ids } }, data: { wears: { increment: 1 } } });
      outfitAdopted = true;
      tips = withTip(tips, 'outfit');
    } else if (action.type === 'add_meal') {
      const id = action.id ?? uid('m');
      const exists = await db.meal.findFirst({ where: { OR: [{ id }, { name: action.name }] } });
      if (!exists) {
        await db.meal.create({
          data: {
            id,
            slot: action.slot,
            name: action.name,
            time: action.time,
            date: '2026-09-22',
            kcal: action.kcal,
            protein: action.protein,
            carb: action.carb,
            fat: action.fat,
          },
        });
      }
      if (key === 'protein' || key === 'cross' || action.name.includes('鸡胸')) tips = withTip(tips, 'protein');
    } else if (action.type === 'apply_scene') {
      const devices = await db.device.findMany();
      for (const device of devices) {
        const next = nextDevice(device, action.name);
        if (next.on !== device.on || next.paramValue !== device.paramValue) {
          await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
        }
      }
      activeScene = action.name;
      if (action.name === '离家') tips = withTip(tips, 'prep');
    } else if (action.type === 'append_packing') {
      const trip = await db.trip.findUnique({ where: { id: action.tripId } });
      if (!trip) continue;
      const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
      const owned = new Set(packing.map((item) => item.text));
      for (const text of action.items) {
        if (!owned.has(text)) packing.push({ id: uid('p'), text, done: false });
      }
      await db.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(packing), prepAdopted: true } });
      activeTripId = trip.id;
      tips = withTip(tips, 'prep');
    } else if (action.type === 'add_expense') {
      const id = action.id ?? uid('e');
      const exists = await db.expense.findUnique({ where: { id } });
      if (!exists) {
        await db.expense.create({
          data: { id, tag: action.tag, amount: action.amount, date: action.date, merchant: action.merchant, note: action.note },
        });
      }
    } else if (action.type === 'handle_alert') {
      await db.alert.updateMany({ where: { id: action.id }, data: { handled: true } });
      if (action.id === 'a-filter') tips = withTip(tips, 'filter');
    }
  }

  if (key === 'cross') {
    suggestionIndex = 1;
    weatherOn = true;
    outfitAdopted = true;
    tips = withTip(withTip(withTip(withTip(tips, 'outfit'), 'protein'), 'prep'), 'filter');
    tips = withTip(tips, 'cross');
  } else if (key) {
    tips = withTip(tips, key);
  }

  await db.sessionState.update({
    where: { id: 'local' },
    data: { adoptedTips: JSON.stringify(tips), outfitAdopted, activeScene, activeTripId, suggestionIndex, weatherOn },
  });
  return readSnapshot(db);
}

async function preset(db: PrismaClient, key: string | undefined, session: { suggestionIndex: number; weatherOn: boolean }): Promise<Action[]> {
  if (key === 'outfit') {
    const items = await db.wardrobeItem.findMany();
    const ids = new Set(items.map((item) => item.id));
    return [{ type: 'adopt_outfit', itemIds: pickSuggestion(session.suggestionIndex, session.weatherOn).itemIds.filter((id) => ids.has(id)) }];
  }
  if (key === 'protein') {
    const [recipes, meals, target] = await Promise.all([
      db.recipe.findMany(),
      db.meal.findMany(),
      db.nutritionTarget.findUniqueOrThrow({ where: { id: 'local' } }),
    ]);
    const picked = pickRecipe(recipes, meals, target);
    if (!picked) return [];
    return [{ type: 'add_meal', slot: picked.slot, name: picked.name, time: '18:30', kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat }];
  }
  if (key === 'filter') return [{ type: 'handle_alert', id: 'a-filter' }];
  return [];
}
