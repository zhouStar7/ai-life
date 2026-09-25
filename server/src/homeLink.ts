import type { PrismaClient } from '@prisma/client';
import { callService, DEFAULT_HA_BASE, fetchStates, mapDevices, mapScenes, serviceFor } from './adapters/home-assistant.js';
import { readJson } from './ids.js';
import { nextDevice } from './scenes.js';

export async function syncHome(db: PrismaClient) {
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  if (!profile.haToken) {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return 'home_unconfigured' as const;
  }
  try {
    const states = await fetchStates(profile.haBase || DEFAULT_HA_BASE, profile.haToken);
    const devices = mapDevices(states);
    const scenes = mapScenes(states);
    await db.device.deleteMany({ where: { source: 'ha' } });
    if (devices.length > 0) {
      await db.device.createMany({ data: devices });
    }
    await db.sessionState.update({
      where: { id: 'local' },
      data: { haConnected: true, haScenes: JSON.stringify(scenes) },
    });
    return null;
  } catch {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return 'home_unavailable' as const;
  }
}

export async function applyNamedScene(db: PrismaClient, name: string) {
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  const scenes = readJson<Record<string, string>>(session.haScenes, {});
  let via: 'local' | 'home-assistant' = 'local';
  if (session.haConnected && profile.haToken && scenes[name]) {
    try {
      await callService(profile.haBase || DEFAULT_HA_BASE, profile.haToken, 'scene', 'turn_on', scenes[name]);
      via = 'home-assistant';
    } catch {
      await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    }
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
