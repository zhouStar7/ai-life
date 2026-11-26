import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { todayIso } from '../calendar.js';
import { uid } from '../ids.js';
import {
  clearSessionCookie,
  hashPassword,
  memberFromRequest,
  openSession,
  sessionCookie,
  validAccount,
  verifyPassword,
} from '../auth.js';
import { ensureMemberData } from '../members.js';

export function registerAuth(app: Hono, db: PrismaClient) {
  app.get('/api/auth/session', async (c) => {
    const member = await memberFromRequest(db, c);
    const register = (await db.member.count()) === 0;
    if (!member) return c.json({ error: 'unauthorized', register }, 401);
    return c.json({ member: { id: member.id, username: member.username, name: member.name }, register: false });
  });

  app.post('/api/auth/register', async (c) => {
    if ((await db.member.count()) > 0) return c.json({ error: 'closed' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const account = validAccount(body);
    if (!account) return c.json({ error: 'invalid' }, 400);
    const member = await db.member.create({
      data: {
        id: uid('m'),
        username: account.username,
        name: account.name,
        passwordHash: await hashPassword(account.password),
        createdAt: todayIso(),
      },
    });
    await ensureMemberData(db, member.id);
    const token = await openSession(db, member.id);
    c.header('set-cookie', sessionCookie(token));
    return c.json({ member: { id: member.id, username: member.username, name: member.name } });
  });

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const member = username ? await db.member.findUnique({ where: { username } }) : null;
    if (!member || !(await verifyPassword(password, member.passwordHash))) return c.json({ error: 'unauthorized' }, 401);
    await ensureMemberData(db, member.id);
    const token = await openSession(db, member.id);
    c.header('set-cookie', sessionCookie(token));
    return c.json({ member: { id: member.id, username: member.username, name: member.name } });
  });

  app.post('/api/auth/logout', async (c) => {
    const token = (c.req.header('cookie') ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('ailife='));
    if (token) await db.authSession.delete({ where: { token: decodeURIComponent(token.slice('ailife='.length)) } }).catch(() => undefined);
    c.header('set-cookie', clearSessionCookie());
    return c.json({ ok: true });
  });

  app.post('/api/members', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const account = validAccount(body);
    if (!account) return c.json({ error: 'invalid' }, 400);
    const taken = await db.member.findUnique({ where: { username: account.username } });
    if (taken) return c.json({ error: 'taken' }, 409);
    const member = await db.member.create({
      data: {
        id: uid('m'),
        username: account.username,
        name: account.name,
        passwordHash: await hashPassword(account.password),
        createdAt: todayIso(),
      },
    });
    await ensureMemberData(db, member.id);
    return c.json({ member: { id: member.id, username: member.username, name: member.name } });
  });
}
