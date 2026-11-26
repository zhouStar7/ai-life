import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  cookieTransport,
  hashPassword,
  isAccountOwner,
  openSession,
  readToken,
  sessionFromRequest,
  sessionHint,
  setSessionCookies,
  validAccount,
  validCredentials,
  verifyPassword,
} from '../auth.js';
import { ensureMemberData } from '../members.js';

const limitedBody = bodyLimit({ maxSize: 4096 });

function canUseCookies(c: Context) {
  return cookieTransport(c) && c.req.header('sec-fetch-site') !== 'cross-site';
}

function publicMember(member: { id: string; username: string; name: string }, isOwner: boolean) {
  return { id: member.id, username: member.username, name: member.name, isOwner };
}

function accountData(id: string, account: { username: string; name: string }, passwordHash: string) {
  return { id, ...account, passwordHash, createdAt: new Date().toISOString() };
}

function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function registerAuth(app: Hono, db: PrismaClient, enabled: boolean) {
  app.get('/api/auth/session', async (c) => {
    if (!enabled) return c.json({ demo: true, member: null, needsSetup: false });
    const session = await sessionFromRequest(db, c);
    if (!session) {
      const needsSetup = (await db.member.count()) === 0;
      return c.json({ error: 'unauthorized', register: needsSetup, needsSetup }, 401);
    }
    return c.json({
      demo: false, member: publicMember(session.member, await isAccountOwner(db, session.member.id)),
      needsSetup: false, cacheSession: session.hint,
    });
  });

  if (!enabled) return;

  app.post('/api/auth/register', limitedBody, async (c) => {
    if (!canUseCookies(c)) return c.json({ error: 'forbidden' }, 403);
    if (await db.member.count()) return c.json({ error: 'closed' }, 403);
    const account = validAccount(await c.req.json().catch(() => null));
    if (!account) return c.json({ error: 'invalid' }, 400);
    const { password, ...profile } = account;
    const passwordHash = await hashPassword(password);
    try {
      // Concurrent first registrations claim the same primary key. The winner also initializes
      // the member's state and opens a session in the same transaction.
      const { member, token } = await db.$transaction(async (tx) => {
        const member = await tx.member.create({ data: accountData('local', profile, passwordHash) });
        await ensureMemberData(tx, member.id);
        const token = await openSession(tx, member.id);
        return { member, token };
      });
      setSessionCookies(c, token);
      return c.json({ demo: false, member: publicMember(member, true), needsSetup: false, cacheSession: sessionHint(token) });
    } catch (error) {
      if (uniqueConflict(error)) return c.json({ error: 'closed' }, 403);
      throw error;
    }
  });

  app.post('/api/auth/login', limitedBody, async (c) => {
    if (!canUseCookies(c)) return c.json({ error: 'forbidden' }, 403);
    const credentials = validCredentials(await c.req.json().catch(() => null));
    if (!credentials) return c.json({ error: 'unauthorized' }, 401);
    const member = await db.member.findUnique({ where: { username: credentials.username } });
    const verified = await verifyPassword(credentials.password, member?.passwordHash);
    if (!member || !verified) return c.json({ error: 'unauthorized' }, 401);
    const owner = await isAccountOwner(db, member.id);
    const previous = readToken(c.req.header('cookie'));
    const token = await db.$transaction(async (tx) => {
      if (previous) await tx.authSession.deleteMany({ where: { token: previous } });
      return openSession(tx, member.id);
    });
    setSessionCookies(c, token);
    return c.json({ demo: false, member: publicMember(member, owner), needsSetup: false, cacheSession: sessionHint(token) });
  });

  app.post('/api/auth/logout', async (c) => {
    if (!canUseCookies(c)) return c.json({ error: 'forbidden' }, 403);
    const token = readToken(c.req.header('cookie'));
    const expected = c.req.header('x-account-session');
    if (token && expected && sessionHint(token) !== expected) return c.json({ error: 'unauthorized' }, 401);
    if (token) await db.authSession.deleteMany({ where: { token } });
    setSessionCookies(c, '');
    return c.json({ ok: true });
  });

  app.post('/api/auth/members', limitedBody, async (c) => {
    const session = await sessionFromRequest(db, c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    if (!await isAccountOwner(db, session.member.id)) return c.json({ error: 'forbidden' }, 403);
    const account = validAccount(await c.req.json().catch(() => null));
    if (!account) return c.json({ error: 'invalid' }, 400);
    const { password, ...profile } = account;
    const passwordHash = await hashPassword(password);
    try {
      const member = await db.$transaction(async (tx) => {
        const member = await tx.member.create({ data: accountData(randomUUID(), profile, passwordHash) });
        await ensureMemberData(tx, member.id);
        return member;
      });
      return c.json({ member: publicMember(member, false) });
    } catch (error) {
      if (uniqueConflict(error)) return c.json({ error: 'taken' }, 409);
      throw error;
    }
  });
}
