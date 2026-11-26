import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { callService, DEFAULT_HA_BASE, homeError, serviceFor } from './adapters/home-assistant.js';
import { readSceneBook } from './homeLink.js';
import { nextDevice, serviceCalls, type ServiceCall } from './scenes.js';

export type HomeTarget = { scene: string } | { device: string };
type Step = { id: string; label: string; call?: ServiceCall; change?: { on: boolean; paramValue: string | null }; blocked?: string };

async function plan(db: PrismaClient, target: HomeTarget) {
  const [profile, session] = await Promise.all([
    db.profile.findUniqueOrThrow({ where: { id: 'local' } }),
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
  ]);
  const live = Boolean(profile.haToken);
  const via = live ? 'home-assistant' : 'local';
  const steps: Step[] = [];
  const book = readSceneBook(session.haScenes);
  const binding = 'scene' in target ? book.bindings[target.scene as keyof typeof book.bindings] : undefined;
  if (binding?.startsWith('scene.') && live) {
    steps.push({ id: binding, label: book.catalog.find((s) => s.id === binding)?.name ?? binding, call: { domain: 'scene', service: 'turn_on' } });
  } else {
    const devices = await db.device.findMany({ where: { source: live ? 'ha' : 'demo', ...('device' in target ? { id: target.device } : {}) }, orderBy: { id: 'asc' } });
    for (const device of devices) {
      // Include an offline device if this action would otherwise affect it.
      const before = { ...device, offline: false };
      const next = 'scene' in target ? nextDevice(before, target.scene) : { ...before, on: !before.on };
      if (device.offline && ('device' in target || device.on !== next.on || device.paramValue !== next.paramValue || (target.scene === '离家' && ['灯', '空调', '电视'].includes(device.kind)))) {
        steps.push({ id: device.id, label: device.name, blocked: '设备离线' });
        continue;
      }
      if (next.on === before.on && next.paramValue === before.paramValue) continue;
      const change = { on: next.on, paramValue: next.paramValue };
      if (!live) { steps.push({ id: device.id, label: device.name, change }); continue; }
      const domain = device.id.split('.')[0];
      const calls = 'device' in target ? [{ domain, service: serviceFor(domain, next.on) }] : serviceCalls(before, next);
      for (const call of calls) {
        // Commit only the fields affected by this particular service.
        const partial = call.service === 'turn_on' && domain === 'climate' ? { on: true, paramValue: before.paramValue } : change;
        steps.push({ id: device.id, label: device.name, call, change: partial });
      }
    }
    if ('device' in target && !devices.length) steps.push({ id: target.device, label: target.device, blocked: '设备未同步或已解绑' });
  }
  if (live && !session.haConnected) steps.forEach((step) => { step.blocked = '家居未连接，请重新同步'; });
  const blocked = live && !session.haConnected ? '家居未连接，请重新同步' : undefined;
  return { via, target, steps, blocked, base: profile.haBase || DEFAULT_HA_BASE, token: profile.haToken };
}

export function homeActions(db: PrismaClient) {
  const pending = new Map<string, { fingerprint: string; expires: number }>();
  let executing = false;
  return async (target: HomeTarget, confirmation?: unknown) => {
    const now = Date.now();
    for (const [key, item] of pending) if (now >= item.expires) pending.delete(key);
    const current = await plan(db, target);
    const fingerprint = JSON.stringify(current);
    const { steps, via, blocked } = current;
    if (confirmation === undefined) {
      const token = randomUUID();
      if (pending.size >= 256) pending.delete(pending.keys().next().value!);
      pending.set(token, { fingerprint, expires: now + 120_000 });
      return { preview: { token, via, steps, blocked } };
    }
    const key = typeof confirmation === 'string' ? confirmation : '';
    const saved = pending.get(key);
    pending.delete(key);
    if (executing || !saved || saved.fingerprint !== fingerprint) return { error: '动作预览已失效，请重新预览' };
    executing = true;
    try {
      const results: { id: string; label: string; action: string; error?: string }[] = [];
      const failures = new Set<string>();
      for (const step of steps) {
        const row = { id: step.id, label: step.label, action: step.call?.service ?? (step.change?.on ? '开启' : '关闭') };
        try {
          if (step.blocked || failures.has(step.id)) {
            results.push({ ...row, error: step.blocked ?? '前一步执行失败，已跳过' });
            continue;
          }
          if (step.call) await callService(current.base, current.token, step.call.domain, step.call.service, step.id, step.call.data);
          if (step.change) await db.device.update({ where: { id: step.id }, data: step.change });
          results.push(row);
        } catch (error) {
          failures.add(step.id);
          results.push({ ...row, error: homeError(error) });
        }
      }
      const failed = results.filter((row) => row.error).length;
      const status = blocked || (failed && failed === results.length) ? 'failed' : failed ? 'partial' : 'done';
      if ('scene' in target && status === 'done') await db.sessionState.update({ where: { id: 'local' }, data: { activeScene: target.scene } });
      return { scene: { name: 'scene' in target ? target.scene : target.device, via, status, results, blocked } };
    } finally { executing = false; }
  };
}
