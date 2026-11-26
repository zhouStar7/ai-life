import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

export const LOCAL_MEMBER_ID = 'local';
export const requestContext = new AsyncLocalStorage<{ memberId: string; tx?: Prisma.TransactionClient }>();

export function currentMemberId() {
  return requestContext.getStore()?.memberId ?? LOCAL_MEMBER_ID;
}

const privateModels = new Set([
  'memberState', 'wardrobeItem', 'wardrobePhoto', 'outfit', 'meal', 'recipe', 'nutritionTarget',
  'trip', 'expense', 'billImport', 'budget', 'notice', 'packingTemplate', 'quickMealDraft',
]);

type Values = Record<string, unknown>;
type ScopedArgs = {
  where?: Values;
  data?: Values | Values[];
  create?: Values;
  update?: Values;
};

function scopedArgs(model: string, method: string, args: ScopedArgs, memberId: string) {
  const owner = { memberId };
  // Keep the original selector at the top level so findUnique, update, and delete
  // retain Prisma's unique-field validation as well as the ownership predicate.
  const where = args.where?.memberId !== undefined
    ? { ...args.where, AND: [owner, ...(Array.isArray(args.where.AND) ? args.where.AND : args.where.AND ? [args.where.AND] : [])] }
    : { ...args.where, ...owner };

  function writable(data: Values, create: boolean) {
    // BillImport and Expense share a compound foreign key. Writes through their
    // delegates enforce ownership, including when both are created in one tx.
    if ('billImport' in data || 'expense' in data) throw new Error('Use scoped delegates for related writes');
    if (data.memberId !== undefined && data.memberId !== memberId) throw new Error('Cannot change row ownership');
    return create ? { ...data, memberId } : data;
  }

  switch (method) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
      return { ...args, data: Array.isArray(args.data) ? args.data.map((data) => writable(data, true)) : writable(args.data ?? {}, true) };
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      return { ...args, where, data: writable((args.data ?? {}) as Values, false) };
    case 'upsert':
      return { ...args, where, create: writable(args.create ?? {}, true), update: writable(args.update ?? {}, false) };
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'delete':
    case 'deleteMany':
      return { ...args, where };
    default:
      throw new Error(`Unsupported scoped query ${model}.${method}`);
  }
}

// Bind both captured route clients and callback clients to the active transaction.
// Delegate calls return the original PrismaPromise so batch transactions still work.
export function contextualDb(db: PrismaClient): PrismaClient {
  const scoped = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction') {
        return (input: ((tx: Prisma.TransactionClient) => unknown) | Prisma.PrismaPromise<unknown>[], options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
          const store = requestContext.getStore();
          if (typeof input !== 'function') return store?.tx ? Promise.all(input) : target.$transaction(input, options);
          if (store?.tx) return Promise.resolve().then(() => input(scoped));
          const memberId = store?.memberId ?? LOCAL_MEMBER_ID;
          return target.$transaction((tx) => requestContext.run({ memberId, tx }, async () => input(scoped)), options);
        };
      }
      if (typeof key === 'string' && privateModels.has(key)) {
        return new Proxy({}, {
          get(_, method) {
            const client = requestContext.getStore()?.tx ?? target;
            const delegate = Reflect.get(client, key);
            const query = Reflect.get(delegate, method);
            if (typeof query !== 'function' || typeof method !== 'string') return query;
            return (args: ScopedArgs = {}) => query.call(delegate, scopedArgs(key, method, args, currentMemberId()));
          },
        });
      }
      const client = requestContext.getStore()?.tx ?? target;
      const value = Reflect.get(client, key);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
  return scoped;
}
