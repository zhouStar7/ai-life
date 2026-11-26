import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import type { Context } from 'hono';

const scryptAsync = promisify(scrypt);
export const SESSION_COOKIE = 'ailife';
const MAX_AGE = 60 * 60 * 24 * 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, salt, hex] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  const previous = Buffer.from(hex, 'hex');
  if (derived.length !== previous.length) return false;
  return timingSafeEqual(derived, previous);
}

export function readToken(header: string | undefined) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function memberFromRequest(db: PrismaClient, c: Context) {
  const token = readToken(c.req.header('cookie'));
  if (!token) return null;
  const session = await db.authSession.findUnique({ where: { token } });
  if (!session || session.expiresAt <= new Date().toISOString()) {
    if (session) await db.authSession.delete({ where: { token } }).catch(() => undefined);
    return null;
  }
  return db.member.findUnique({ where: { id: session.memberId } });
}

export async function openSession(db: PrismaClient, memberId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + MAX_AGE * 1000).toISOString();
  await db.authSession.create({ data: { token, memberId, expiresAt: expires } });
  return token;
}

export function memberOf(c: { get: (key: string) => unknown }) {
  const id = c.get('memberId');
  if (typeof id !== 'string' || !id) throw new Error('member');
  return id;
}

const USERNAME = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export function validAccount(body: { username?: unknown; name?: unknown; password?: unknown }) {
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME.test(username) || name.length < 1 || name.length > 20 || password.length < 6 || password.length > 72) return null;
  return { username, name, password };
}
