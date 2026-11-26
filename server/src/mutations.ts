import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { MiddlewareHandler } from 'hono';
import { memberOf } from './auth.js';
import { requestContext } from './requestContext.js';

// External actions cannot be rolled back with SQLite. Reserve their keys before calling out.
const external = /\/api\/(agent|scenes|home\/sync|devices\/[^/]+\/toggle|trips\/[^/]+\/(chain|adopt-prep)|wardrobe\/(recognize|drafts|suggestion\/refresh)|trips\/parse|bills\/preview|weather\/refresh)/;
export function mutations(db: PrismaClient): MiddlewareHandler {
  let tail: Promise<unknown> = Promise.resolve();
  return async (c, next) => {
    const key = c.req.header('idempotency-key');
    if (!key || ['GET', 'HEAD'].includes(c.req.method) || c.req.path.startsWith('/api/auth/')) return next();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key)) return c.json({ error: 'invalid_key' }, 400);
    const memberId = memberOf(c);
    const signature = createHash('sha256').update(`${c.req.method}\n${c.req.path}\n${await c.req.text()}`).digest('hex');
    const where = { memberId_key: { memberId, key } };
    const compact = requestContext.getStore()?.compact ?? false;
    const run = async () => {
      const existing = await db.mutationReceipt.findUnique({ where });
      if (existing) {
        if (existing.signature !== signature) { c.res = c.json({ error: 'key_reused' }, 409); return; }
        if (!existing.response) { c.res = c.json({ error: 'operation_uncertain' }, 409); return; }
        c.res = new Response(existing.response, { status: existing.status, headers: { 'content-type': 'application/json', 'idempotency-replayed': 'true' } });
        return;
      }
      const execute = async (client: Pick<PrismaClient, 'mutationReceipt'>) => {
        await client.mutationReceipt.create({ data: { memberId, key, signature, status: 0, response: '' } });
        await next();
        if (c.res.status >= 500) throw new Error('mutation_failed');
        await client.mutationReceipt.update({ where, data: { status: c.res.status, response: await c.res.clone().text() } });
      };
      if (external.test(c.req.path)) {
        // A failed/unknown external action remains reserved: never blindly execute it twice.
        await execute(db);
      } else {
        await db.$transaction(tx => requestContext.run({ compact, tx }, () => execute(tx)), { timeout: 15_000 });
      }
    };
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    await result;
  };
}
