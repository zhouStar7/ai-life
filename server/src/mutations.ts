import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { MiddlewareHandler } from 'hono';
import { isMonth } from '../../shared/spending.js';
import { contextualDb, currentMemberId, requestContext } from './requestContext.js';
import { readSnapshot } from './snapshot.js';

const noWrite = new Set([
  '/api/agent/arrange', '/api/bills/preview', '/api/model/check', '/api/meals/estimate',
  '/api/trips/parse', '/api/wardrobe/drafts', '/api/wardrobe/recognize',
]);
const external = /^\/api\/(?:home\/sync$|scenes\/[^/]+$|devices\/[^/]+\/toggle$|weather\/refresh$)/;

export function mutations(db: PrismaClient): MiddlewareHandler {
  const scoped = contextualDb(db);
  let tail = Promise.resolve();

  return async (c, next) => {
    const key = c.req.header('idempotency-key');
    const { method, path, url } = c.req;
    if (!key || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || noWrite.has(path)
      || path.startsWith('/api/auth/') || path.startsWith('/api/shortcuts/') || path === '/api/members'
      || /^\/api\/trips\/[^/]+\/chain$/.test(path)) return next();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(key)) return c.json({ error: 'invalid_key' }, 400);

    const state = requestContext.getStore();
    const memberId = currentMemberId();
    const query = new URL(url).search;
    const body = await c.req.text();
    const signature = createHash('sha256').update(JSON.stringify([method, path, query, body])).digest('hex');
    const legacySignature = createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
    const where = { memberId_key: { memberId, key } };
    let started: Response | undefined;

    const execute = async (client: Pick<PrismaClient, 'mutationReceipt'>) => {
      let existing = await client.mutationReceipt.findUnique({ where });
      if (!existing) {
        try {
          await client.mutationReceipt.create({ data: { memberId, key, signature, status: 0, response: '' } });
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
          existing = await client.mutationReceipt.findUniqueOrThrow({ where });
        }
      }
      if (existing) {
        if (existing.signature !== signature && existing.signature !== legacySignature) {
          c.res = c.json({ error: 'key_reused' }, 409);
          return;
        }
        if (!existing.response) { c.res = c.json({ error: 'operation_uncertain' }, 409); return; }
        const receipt = JSON.parse(existing.response);
        if (receipt && typeof receipt === 'object' && 'snapshot' in receipt) {
          const month = c.req.query('month');
          receipt.snapshot = await readSnapshot(scoped, isMonth(month) ? month : undefined);
        }
        c.res = new Response(JSON.stringify(receipt), {
          status: existing.status,
          headers: { 'content-type': 'application/json', 'idempotency-replayed': 'true' },
        });
        return;
      }
      await next();
      if (c.res.status >= 500) {
        started = c.res;
        throw new Error('mutation_failed');
      }
      const receipt = await c.res.clone().json();
      if (receipt && typeof receipt === 'object' && 'snapshot' in receipt) receipt.snapshot = null;
      await client.mutationReceipt.update({ where, data: { status: c.res.status, response: JSON.stringify(receipt) } });
    };

    if (external.test(path)) {
      // Reserve outside a transaction. An interrupted external command may have run.
      try { await execute(db); } catch (error) { if (!started) throw error; c.res = started; }
      return;
    }
    const result = tail.then(() => db.$transaction(
      tx => requestContext.run({ ...state, memberId, tx }, () => execute(tx)), { timeout: 35_000 },
    ));
    tail = result.then(() => undefined, () => undefined);
    try { await result; } catch (error) { if (!started) throw error; c.res = started; }
  };
}
