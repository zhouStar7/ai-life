import type { PrismaClient } from '@prisma/client';
import { callService, DEFAULT_HA_BASE, serviceFor } from './adapters/home-assistant.js';
import { applyNamedScene } from './homeLink.js';
import { readJson } from './ids.js';
import { nextDevice } from './scenes.js';

const AWAY = '离家';

export async function applyTripAway(db: PrismaClient) {
  const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
  const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
  const scenes = readJson<Record<string, string>>(session.haScenes, {});
  if (!session.haConnected || !profile.haToken || scenes[AWAY]) return applyNamedScene(db, AWAY);

  const devices = await db.device.findMany({ where: { source: 'ha' } });
  if (devices.length === 0) return applyNamedScene(db, AWAY);
  const base = profile.haBase || DEFAULT_HA_BASE;
  let tried = 0;
  let failed = 0;
  for (const device of devices) {
    const next = nextDevice(device, AWAY);
    if (device.offline || next.on === device.on) continue;
    const domain = device.id.split('.')[0];
    if (domain !== 'light' && domain !== 'climate' && domain !== 'media_player') continue;
    tried += 1;
    try {
      await callService(base, profile.haToken, domain, serviceFor(domain, next.on), device.id);
      await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
    } catch {
      failed += 1;
    }
  }
  if (tried > 0 && failed === tried) {
    await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false } });
    return applyNamedScene(db, AWAY);
  }
  await db.sessionState.update({ where: { id: 'local' }, data: { activeScene: AWAY } });
  return { name: AWAY, via: 'home-assistant' as const };
}
