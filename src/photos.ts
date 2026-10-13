import { db, newRevision } from './db';
import type { Asset } from './types';

async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function processPhoto(file: File): Promise<Asset> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('無法讀取這張照片，請改用 JPG 或 PNG。'); }
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d'); if (!context) throw new Error('目前瀏覽器無法處理照片。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let output: Blob | null = null;
  for (const quality of [0.8, 0.72, 0.64, 0.56, 0.48]) { output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality)); if (!output || output.type !== 'image/webp') throw new Error('此瀏覽器不支援 WebP 照片，請先轉檔。'); if (output.size <= 500 * 1024) break; }
  if (!output || output.size > 500 * 1024) throw new Error('照片壓縮後仍超過 500 KiB，請選擇較小的照片。');
  const head = new Uint8Array(await output.slice(0, 12).arrayBuffer());
  if (String.fromCharCode(...head.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...head.slice(8, 12)) !== 'WEBP') throw new Error('照片格式驗證失敗。');
  const sha256 = await digest(output); const found = await db.assets.where('sha256').equals(sha256).first(); if (found) return found;
  const now = new Date().toISOString(); const asset: Asset = { id: crypto.randomUUID(), sha256, mimeType: 'image/webp', bytes: output.size, width: canvas.width, height: canvas.height, blob: output, createdAt: now, updatedAt: now, createdByProfileId: '', ...newRevision() };
  await db.assets.put(asset); return asset;
}
export async function getAssetUrl(id?: string): Promise<string | undefined> { if (!id) return undefined; const asset = await db.assets.get(id); return asset ? URL.createObjectURL(asset.blob) : undefined; }
