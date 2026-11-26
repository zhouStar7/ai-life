import type { ClothingDraft } from './types';
import { blankDraft } from './wardrobePlan';

export async function coverFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('照片读取失败，请重新选择。'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 720 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('照片处理失败，请重试。')); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      image.onerror = () => reject(new Error('照片格式暂不支持，请选择 JPG、PNG 或 WebP 图片。'));
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export async function readClothingPhotos(files: File[], recognize: (image: string) => Promise<ClothingDraft | 'manual' | null>) {
  const drafts: ClothingDraft[] = [];
  const failed: string[] = [];
  let manual = false;
  for (const file of files) {
    try {
      const cover = await coverFromFile(file);
      const result = await recognize(cover);
      if (!result || result === 'manual') manual = true;
      drafts.push({ ...(result && result !== 'manual' ? result : blankDraft()), cover });
    } catch { failed.push(file.name); }
  }
  return { drafts, manual, failed };
}

