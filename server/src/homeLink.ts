import type { PrismaClient } from '@prisma/client';
import {
  homeError,
  DEFAULT_HA_BASE,
  deriveAlerts,
  fetchAreas,
  fetchStates,
  listSceneCatalog,
  mapDevices,
  mapScenes,
} from './adapters/home-assistant.js';
import { readJson } from './ids.js';

const SCENE_NAMES = ['回家', '离家', '睡眠', '影院'] as const;
const EXAMPLE_ALERTS = ['a-filter', 'a-offline', 'a-battery'];

export type SceneCatalogItem = { id: string; name: string };
export type SceneBook = {
  bindings: Partial<Record<(typeof SCENE_NAMES)[number], string>>;
  catalog: SceneCatalogItem[];
};

export function readSceneBook(raw: string): SceneBook {
  const parsed = readJson<Record<string, unknown>>(raw, {});
  const bindings: SceneBook['bindings'] = {};
  for (const name of SCENE_NAMES) {
    const value = parsed[name];
    if (value === 'devices' || (typeof value === 'string' && value.startsWith('scene.'))) bindings[name] = value;
  }
  const catalog = Array.isArray(parsed._catalog)
    ? parsed._catalog.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { id?: unknown; name?: unknown };
      if (typeof row.id !== 'string' || !row.id.startsWith('scene.')) return [];
      return [{ id: row.id, name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : row.id }];
    })
    : [];
  return { bindings, catalog };
}

function writeSceneBook(book: SceneBook) {
  return JSON.stringify({ ...book.bindings, _catalog: book.catalog });
}

export async function syncHome(db: PrismaClient) {
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  if (!profile.haToken) {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return 'home_unconfigured' as const;
  }
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  try {
    const base = profile.haBase || DEFAULT_HA_BASE;
    const states = await fetchStates(base, profile.haToken);
    const areas = await fetchAreas(base, profile.haToken);
    const devices = mapDevices(states, areas);
    const catalog = listSceneCatalog(states);
    const book = mergeBook(readSceneBook(session.haScenes), mapScenes(states), catalog);
    const alerts = deriveAlerts(states, devices);
    const prior = await db.alert.findMany();
    const handled = new Map(prior.map((alert) => [alert.id, alert.handled]));
    await db.device.deleteMany({ where: { source: 'ha' } });
    if (devices.length > 0) await db.device.createMany({ data: devices });
    await db.alert.deleteMany({
      where: { OR: [{ id: { in: EXAMPLE_ALERTS } }, { id: { startsWith: 'ha-' } }] },
    });
    if (alerts.length > 0) {
      await db.alert.createMany({
        data: alerts.map((alert) => ({ ...alert, handled: handled.get(alert.id) ?? false })),
      });
    }
    await db.sessionState.update({
      where: { id: 'local' },
      data: { haConnected: true, haScenes: writeSceneBook(book) },
    });
    return null;
  } catch (error) {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return homeError(error);
  }
}

export async function bindScene(db: PrismaClient, name: string, target: string) {
  if (!SCENE_NAMES.includes(name as (typeof SCENE_NAMES)[number])) return 'invalid' as const;
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  const book = readSceneBook(session.haScenes);
  if (target !== 'devices' && !book.catalog.some((item) => item.id === target)) return 'invalid' as const;
  book.bindings[name as (typeof SCENE_NAMES)[number]] = target;
  await db.sessionState.update({ where: { id: 'local' }, data: { haScenes: writeSceneBook(book) } });
  return null;
}

function mergeBook(previous: SceneBook, auto: Record<string, string>, catalog: SceneCatalogItem[]): SceneBook {
  const bindings = { ...previous.bindings };
  const ids = new Set(catalog.map((item) => item.id));
  for (const name of SCENE_NAMES) {
    const chosen = previous.bindings[name];
    if (chosen === 'devices') continue;
    if (chosen?.startsWith('scene.') && ids.has(chosen)) continue;
    if (auto[name]) bindings[name] = auto[name];
    else delete bindings[name];
  }
  return { bindings, catalog };
}
