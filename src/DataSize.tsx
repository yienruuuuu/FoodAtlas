import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from './db';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} ${units[index]}`;
}

/** Logical payload size: UTF-8 record data plus binary blobs, excluding browser overhead. */
export default function DataSize() {
  const [size, setSize] = useState<{ total: number; photos: number }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const subscription = liveQuery(() => db.transaction<{ total: number; photos: number }>('r', db.tables, async () => {
      let records = 0;
      let photos = 0;
      for (const table of db.tables) {
        await table.each(row => {
          const json = JSON.stringify(row, (_key, value: unknown) => {
            if (value instanceof Blob) { photos += value.size; return undefined; }
            return value;
          });
          records += new TextEncoder().encode(json).byteLength;
        });
      }
      return { total: records + photos, photos };
    })).subscribe({
      next: value => { setSize(value); setFailed(false); },
      error: () => { setSize(undefined); setFailed(true); },
    });
    return () => subscription.unsubscribe();
  }, []);
  return <div className="settings-card setting-row" role="status">
    <div><b>目前資料大小</b><p>{failed ? '暫時無法計算，請重新進入此頁。' : size ? `含照片 ${formatBytes(size.photos)}；不含 App 快取，非 ZIP 壓縮後大小。` : '正在計算圖鑑與照片…'}</p></div>
    <strong style={{ flexShrink: 0, fontSize: 13, color: '#ad462b' }}>{size ? `約 ${formatBytes(size.total)}` : '—'}</strong>
  </div>;
}
