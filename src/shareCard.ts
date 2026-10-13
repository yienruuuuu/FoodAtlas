import QRCode from 'qrcode';
import { db } from './db';

export type BackgroundSource = 'random' | 'restaurant';
export interface ShareCardData {
  name: string; categories: string[]; tags: string[]; location: string; budget: string;
  coverAssetId?: string; mapUrl?: string;
}

async function background(source: BackgroundSource, data: ShareCardData, signal: AbortSignal) {
  signal.throwIfAborted();
  let blob: Blob;
  if (source === 'restaurant') {
    const asset = data.coverAssetId ? await db.assets.get(data.coverAssetId) : undefined;
    if (!asset) throw new Error('沒有餐廳照片');
    blob = asset.blob;
  } else {
    if (!navigator.onLine) throw new Error('離線');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 8000);
    try {
      const response = await fetch(`https://picsum.photos/1200/675?random=${crypto.randomUUID()}`, { mode: 'cors', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('照片取得失敗');
      blob = await response.blob();
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
  return bitmap;
}

function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, limit: number) {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  let offset = 0;
  for (let row = 0; row < limit && offset < chars.length; row++) {
    let value = '';
    while (offset < chars.length && ctx.measureText(value + chars[offset]).width <= width) value += chars[offset++];
    if (row === limit - 1 && offset < chars.length) {
      while (value && ctx.measureText(value + '…').width > width) value = value.slice(0, -1);
      value += '…';
    }
    ctx.fillText(value, x, y + row * lineHeight);
  }
}

export async function createShareCard(data: ShareCardData, preferred: BackgroundSource, signal: AbortSignal) {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 675;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法產生圖片');
  const sources: BackgroundSource[] = [preferred, preferred === 'random' ? 'restaurant' : 'random'];
  let used: BackgroundSource | 'black' = 'black';
  for (const source of sources) {
    let image: ImageBitmap | undefined;
    try {
      image = await background(source, data, signal);
      const scale = Math.max(1200 / image.width, 675 / image.height);
      ctx.drawImage(image, (1200 - image.width * scale) / 2, (675 - image.height * scale) / 2, image.width * scale, image.height * scale);
      ctx.getImageData(0, 0, 1, 1); // Reject any image that cannot be exported safely.
      used = source; break;
    } catch {
      signal.throwIfAborted();
      canvas.width = 1200; // Also resets an origin-tainted canvas before fallback.
    } finally { image?.close(); }
  }
  if (used === 'black') { ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, 1200, 675); }
  else {
    const gradient = ctx.createLinearGradient(0, 0, 1200, 0);
    gradient.addColorStop(0, 'rgba(12,14,18,.93)'); gradient.addColorStop(.65, 'rgba(12,14,18,.72)'); gradient.addColorStop(1, 'rgba(12,14,18,.38)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 675);
  }
  await document.fonts.ready; signal.throwIfAborted();
  const font = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#ffbf99'; ctx.font = `bold 23px ${font}`; ctx.fillText('今天粗啥  /  TODAY’S PICK', 64, 70);
  ctx.fillStyle = '#ffffff'; ctx.font = `bold 56px ${font}`; lines(ctx, data.name, 64, 160, 830, 72, 2);
  ctx.font = `26px ${font}`; ctx.fillStyle = '#eae4de';
  lines(ctx, `料理  ${data.categories.join(' · ') || '尚未分類'}`, 64, 315, 810, 36, 1);
  lines(ctx, `位置  ${data.location || '尚未提供位置'}`, 64, 365, 810, 36, 1);
  lines(ctx, `每人預算  ${data.budget}`, 64, 415, 810, 36, 1);
  ctx.fillStyle = '#ffd3b8'; lines(ctx, data.tags.map(tag => `#${tag}`).join('  '), 64, 473, 810, 36, 1);
  let mapUrl: string | undefined;
  try { const url = new URL(data.mapUrl ?? ''); if (['http:', 'https:'].includes(url.protocol)) mapUrl = url.href; } catch { /* No valid map link. */ }
  if (mapUrl) {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, mapUrl, { width: 200, margin: 4, errorCorrectionLevel: 'M' });
    ctx.drawImage(qr, 936, 389, 200, 200);
    ctx.fillStyle = '#fff'; ctx.font = `20px ${font}`; ctx.fillText('掃碼開啟地圖', 975, 623);
  }
  ctx.fillStyle = '#e2d8ce'; ctx.font = `22px ${font}`; ctx.fillText('下一餐，一起發現。', 64, 612);
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('圖片匯出失敗')), 'image/png'));
  signal.throwIfAborted();
  return { blob, used };
}

export function downloadShareCard(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url;
  link.download = `今天粗啥－${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 60) || '餐廳'}－${new Date().toLocaleDateString('sv-SE')}.png`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
