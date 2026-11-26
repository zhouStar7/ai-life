import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

export const requestContext = new AsyncLocalStorage<{ compact: boolean; tx?: Prisma.TransactionClient }>();
// Route handlers and helpers use the same transaction, including nested operations.
export function contextualDb(db: PrismaClient): PrismaClient {
  return new Proxy(db, { get(target, key) {
    const tx = requestContext.getStore()?.tx;
    if (tx && key === '$transaction') return (input: unknown) => typeof input === 'function'
      ? input(tx) : Promise.all(input as Promise<unknown>[]);
    const client = tx ?? target;
    const value = Reflect.get(client, key);
    return typeof value === 'function' ? value.bind(client) : value;
  } });
}
