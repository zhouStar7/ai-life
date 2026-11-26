import type { ClothingDraft } from './types';
import { blankDraft } from './wardrobePlan';

export async function coverFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('照片处理失败，请重试。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readClothingPhotos(files: File[], recognize: (image: string) => Promise<ClothingDraft | 'manual' | null>) {
  const drafts: ClothingDraft[] = [];
  let failed = 0;
  for (const file of files) {
    const cover = await coverFromFile(file).catch(() => null);
    if (!cover) {
      failed += 1;
      continue;
    }
    const result = await recognize(cover).catch(() => null);
    drafts.push({ ...(result && result !== 'manual' ? result : blankDraft()), cover });
  }
  return { drafts, failed };
}
