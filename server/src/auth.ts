import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Context } from 'hono';

const scryptAsync = promisify(scrypt);
const MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_COOKIE = 'ailife';
const CONTEXT_COOKIE = 'ailife-context';
const TOKEN = /^[a-f0-9]{64}$/;
const USERNAME = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const MAX_PASSWORD_OPERATIONS = 8;
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(64)}`;
const LEGACY_DEFAULT_PASSWORD = 'life-local';
const LEGACY_RESET_REQUIRED = 'reset-required';

let pendingPasswords = 0;
export class PasswordBusyError extends Error {}

async function derivePassword(password: string, salt: string) {
  if (pendingPasswords >= MAX_PASSWORD_OPERATIONS) throw new PasswordBusyError();
  pendingPasswords++;
  try {
    return (await scryptAsync(password, salt, 32)) as Buffer;
  } finally {
    pendingPasswords--;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derivePassword(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored = DUMMY_HASH) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (!match || !validPassword(password)) return false;
  const [ , salt, hex] = match;
  return timingSafeEqual(await derivePassword(password, salt), Buffer.from(hex, 'hex'));
}

export function readToken(header: string | undefined) {
  for (const part of header?.split(';') ?? []) {
    const entry = part.trim();
    if (entry.startsWith(`${SESSION_COOKIE}=`)) {
      const token = entry.slice(SESSION_COOKIE.length + 1);
      return TOKEN.test(token) ? token : '';
    }
  }
  return '';
}

// The browser-readable digest binds offline packing data to this session without exposing its credential.
export function sessionHint(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function cookieTransport(c: Context) {
  const url = new URL(c.req.url);
  if (url.protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https') return 'secure';
  return url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname) ? 'loopback' : null;
}

export function setSessionCookies(c: Context, token: string) {
  const policy = `Path=/; SameSite=Lax; Max-Age=${token ? MAX_AGE : 0}${cookieTransport(c) === 'secure' ? '; Secure' : ''}`;
  c.header('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; ${policy}`, { append: true });
  c.header('Set-Cookie', `${CONTEXT_COOKIE}=${token ? sessionHint(token) : ''}; ${policy}`, { append: true });
}

export async function sessionFromRequest(db: Prisma.TransactionClient, c: Context) {
  const token = readToken(c.req.header('cookie'));
  if (!token) return null;
  const session = await db.authSession.findUnique({ where: { token } });
  if (!session || session.expiresAt <= new Date().toISOString()) return null;
  const member = await db.member.findUnique({ where: { id: session.memberId } });
  return member ? { member, hint: sessionHint(token) } : null;
}

export async function openSession(db: Prisma.TransactionClient, memberId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000).toISOString();
  await db.authSession.create({ data: { token, memberId, expiresAt } });
  return token;
}

export async function accountOwnerId(db: Prisma.TransactionClient) {
  const local = await db.member.findUnique({ where: { id: 'local' }, select: { id: true } });
  if (local) return local.id;
  // The WIP used this seeded account as owner and put pre-account records under its ID.
  const legacy = await db.member.findUnique({ where: { id: 'm-xingyu' }, select: { id: true } });
  if (legacy) return legacy.id;
  const first = await db.member.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  return first?.id ?? 'local';
}

export async function isAccountOwner(db: Prisma.TransactionClient, memberId: string) {
  return memberId === 'local' || memberId === await accountOwnerId(db);
}

export async function secureLegacyCredentials(db: PrismaClient, replacement: string | undefined) {
  const id = 'm-xingyu';
  const member = await db.member.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!member) return null;
  const resetRequired = member.passwordHash === LEGACY_RESET_REQUIRED;
  if (!resetRequired && !await verifyPassword(LEGACY_DEFAULT_PASSWORD, member.passwordHash)) return null;
  const rotate = validPassword(replacement) && replacement !== LEGACY_DEFAULT_PASSWORD;
  if (resetRequired && !rotate) return 'required';
  const passwordHash = rotate ? await hashPassword(replacement) : LEGACY_RESET_REQUIRED;
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.member.updateMany({ where: { id, passwordHash: member.passwordHash }, data: { passwordHash } });
    if (count) await tx.authSession.deleteMany({ where: { memberId: id } });
    return count > 0;
  });
  return changed ? rotate ? 'rotated' : 'required' : null;
}

function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 6 && password.length <= 72;
}

export function validCredentials(body: { username?: unknown; password?: unknown } | null) {
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  return USERNAME.test(username) && validPassword(body?.password) ? { username, password: body.password } : null;
}

export function validAccount(body: { username?: unknown; name?: unknown; password?: unknown } | null) {
  const credentials = validCredentials(body);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  return credentials && name.length >= 1 && name.length <= 20 ? { ...credentials, name } : null;
}
