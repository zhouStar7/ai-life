import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

const PHOTO_PREFIX = 'photo:';
const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/]+={0,2})$/;

type PhotoDb = Pick<Prisma.TransactionClient, 'wardrobePhoto' | 'wardrobeItem'>;

export function photoData(value: unknown) {
  if (typeof value !== 'string' || value.length > 1_500_000) return null;
  return DATA_IMAGE.exec(value);
}

export async function storePhoto(db: PhotoDb, data: string) {
  const id = randomUUID();
  await db.wardrobePhoto.create({ data: { id, data } });
  return `${PHOTO_PREFIX}${id}`;
}

export function coverUrl(id: string, cover: string) {
  if (!cover) return '';
  const url = `/api/items/${encodeURIComponent(id)}/cover`;
  return cover.startsWith(PHOTO_PREFIX) ? `${url}?v=${encodeURIComponent(cover.slice(PHOTO_PREFIX.length))}` : url;
}

export async function readPhoto(db: PhotoDb, cover: string) {
  if (!cover.startsWith(PHOTO_PREFIX)) return photoData(cover);
  const row = await db.wardrobePhoto.findUnique({ where: { id: cover.slice(PHOTO_PREFIX.length) } });
  return photoData(row?.data);
}

export async function removeUnusedPhoto(db: PhotoDb, cover: string) {
  if (!cover.startsWith(PHOTO_PREFIX)) return;
  const references = await db.wardrobeItem.count({ where: { cover } });
  if (references === 0) await db.wardrobePhoto.deleteMany({ where: { id: cover.slice(PHOTO_PREFIX.length) } });
}
