import type { PrismaClient } from '@prisma/client';
import {
  callService,
  DEFAULT_HA_BASE,
  deriveAlerts,
  fetchAreas,
  fetchStates,
  listSceneCatalog,
  mapDevices,
  mapScenes,
  serviceFor,
} from './adapters/home-assistant.js';
import { readJson } from './ids.js';
import { nextDevice, serviceCalls } from './scenes.js';

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
  } catch {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return 'home_unavailable' as const;
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

export async function applyNamedScene(db: PrismaClient, name: string) {
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  const book = readSceneBook(session.haScenes);
  const binding = book.bindings[name as (typeof SCENE_NAMES)[number]];
  let via: 'local' | 'home-assistant' = 'local';
  if (session.haConnected && profile.haToken && binding?.startsWith('scene.')) {
    try {
      await callService(profile.haBase || DEFAULT_HA_BASE, profile.haToken, 'scene', 'turn_on', binding);
      via = 'home-assistant';
    } catch {
      await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    }
  } else if (session.haConnected && profile.haToken) {
    const acted = await applyDeviceActions(db, profile.haBase || DEFAULT_HA_BASE, profile.haToken, name);
    if (acted) via = 'home-assistant';
  }
  if (via === 'local') {
    const devices = await db.device.findMany({ where: { source: 'demo' } });
    for (const device of devices) {
      const next = nextDevice(device, name);
      await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
    }
  }
  await db.sessionState.update({ where: { id: 'local' }, data: { activeScene: name } });
  return { name, via };
}

export async function toggleDevice(db: PrismaClient, id: string) {
  const device = await db.device.findUnique({ where: { id } });
  if (!device || device.offline) return null;
  if (device.source !== 'ha') {
    await db.device.update({ where: { id: device.id }, data: { on: !device.on } });
    return null;
  }
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  if (!session.haConnected || !profile.haToken) return 'home_unavailable' as const;
  const domain = device.id.split('.')[0];
  try {
    await callService(profile.haBase || DEFAULT_HA_BASE, profile.haToken, domain, serviceFor(domain, !device.on), device.id);
    await db.device.update({ where: { id: device.id }, data: { on: !device.on } });
    return null;
  } catch {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return 'home_unavailable' as const;
  }
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

async function applyDeviceActions(db: PrismaClient, base: string, token: string, name: string) {
  const devices = await db.device.findMany({ where: { source: 'ha' } });
  let failed = 0;
  let tried = 0;
  for (const device of devices) {
    const next = nextDevice(device, name);
    const calls = serviceCalls(device, next);
    let deviceFailed = false;
    for (const call of calls) {
      tried += 1;
      try {
        await callService(base, token, call.domain, call.service, device.id, call.data);
      } catch {
        failed += 1;
        deviceFailed = true;
      }
    }
    if (!deviceFailed && (next.on !== device.on || next.paramValue !== device.paramValue)) {
      await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
    }
  }
  if (tried > 0 && failed === tried) {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return false;
  }
  return true;
}
