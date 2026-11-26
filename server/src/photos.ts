import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
export async function storePhoto(db: PrismaClient, value: unknown) {
  if (typeof value !== 'string' || value.length > 1_500_000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(value)) return '';
  const id = createHash('sha256').update(value).digest('hex');
  await db.wardrobePhoto.upsert({ where: { id }, create: { id, data: value }, update: {} });
  return `photo:${id}`;
}
export async function photoValue(db: PrismaClient, item: { id: string; cover: string }, compact: boolean) {
  if (!item.cover.startsWith('photo:')) return item.cover;
  const id = item.cover.slice(6);
  if (compact) return `/api/items/${encodeURIComponent(item.id)}/cover?v=${id}`;
  return (await db.wardrobePhoto.findUnique({ where: { id } }))?.data ?? '';
}
export async function migratePhotos(db: PrismaClient) {
  const items = await db.wardrobeItem.findMany({ where: { cover: { startsWith: 'data:image/' } }, select: { id: true, cover: true } });
  for (const item of items) {
    const cover = await storePhoto(db, item.cover);
    if (cover) await db.wardrobeItem.update({ where: { id: item.id }, data: { cover } });
  }
}
