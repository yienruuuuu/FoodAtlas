import JSZip from 'jszip';
import { db, initializeDataset } from './db';
import type { Asset, CatalogOption, Dataset, Restaurant, RestaurantPost, RestaurantProfileRating, Wishlist } from './types';
import { applyMerge, planMerge, type ConflictChoice, type MergePlan, type SyncSnapshot } from './syncEngine';
import { normalizeSnapshotOptions } from './catalog';
import { deletedOptionIds } from './optionDeletion';

const FORMAT_VERSION = 2;
type Bundle = { restaurants: Restaurant[]; wishlists: Wishlist[]; ratings: RestaurantProfileRating[]; posts: RestaurantPost[]; assets: Asset[]; options: CatalogOption[] };
export async function exportZip() {
  const dataset = await initializeDataset(); const bundle: Bundle = { restaurants: await db.restaurants.toArray(), wishlists: await db.wishlists.toArray(), ratings: await db.ratings.toArray(), posts: await db.posts.toArray(), assets: await db.assets.toArray(), options: await db.catalogOptions.toArray() };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ formatVersion: FORMAT_VERSION, datasetId: dataset.id, exportedAt: new Date().toISOString(), profiles: dataset.profiles, assetHashes: bundle.assets.map(asset => asset.sha256), optionDeletions: await deletedOptionIds() }));
  zip.file('entities.json', JSON.stringify({ restaurants: bundle.restaurants, wishlists: bundle.wishlists, ratings: bundle.ratings, posts: bundle.posts, options: bundle.options }));
  zip.file('revisions.json', JSON.stringify({ assets: bundle.assets.map(({ blob: _blob, ...asset }) => asset) }));
  for (const asset of bundle.assets) zip.file(`assets/${asset.sha256}.webp`, asset.blob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `food-atlas-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.zip`; a.click(); URL.revokeObjectURL(url);
  await db.settings.put({ key: 'lastExportAt', value: new Date().toISOString() });
  window.dispatchEvent(new Event('food-atlas-exported'));
}
export async function inspectZip(file: File) {
  if (file.size > 150 * 1024 * 1024) throw new Error('備份檔超過 150 MB，為保護手機記憶體已拒絕匯入。');
  const zip = await JSZip.loadAsync(file, { checkCRC32: false }); const names = Object.keys(zip.files);
  if (names.length > 6000 || names.some(n => n.startsWith('/') || n.includes('..') || n.includes('\\'))) throw new Error('備份檔項目數異常或包含不安全路徑。');
  const inflated = Object.values(zip.files).reduce((sum, entry) => sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (inflated > 200 * 1024 * 1024) throw new Error('解壓後的備份超過 200 MB，已拒絕匯入。');
  const manifestFile = zip.file('manifest.json'); const entitiesFile = zip.file('entities.json');
  const revisionsFile = zip.file('revisions.json');
  if (!manifestFile || !entitiesFile || !revisionsFile) throw new Error('缺少備份必要檔案。');
  const manifest = JSON.parse(await manifestFile.async('string')) as { formatVersion: number; datasetId: string; profiles: unknown; assetHashes?: string[]; optionDeletions?: string[] };
  if (![1, FORMAT_VERSION].includes(manifest.formatVersion) || !manifest.datasetId || !Array.isArray(manifest.profiles) || manifest.profiles.length !== 2 || manifest.profiles.some((p: unknown) => !p || typeof p !== 'object' || typeof (p as { id?: unknown }).id !== 'string' || typeof (p as { displayName?: unknown }).displayName !== 'string')) throw new Error('家庭資料或 Profile 格式不正確。');
  const entities = JSON.parse(await entitiesFile.async('string')) as Partial<Bundle>;
  if (Object.keys(entities).some(key => !['restaurants','wishlists','ratings','posts','options'].includes(key))) throw new Error('備份包含未知資料類型。');
  const revisions = JSON.parse(await revisionsFile.async('string')) as { assets?: Omit<Asset, 'blob'>[] };
  if (!Array.isArray(revisions.assets)) throw new Error('照片索引格式不正確。');
  for (const key of ['restaurants', 'wishlists', 'ratings', 'posts'] as const) if (!Array.isArray(entities[key])) throw new Error(`資料格式不正確：${key}`);
  const assets: Asset[] = [];
  for (const [index, restaurant] of entities.restaurants!.entries()) if (!restaurant?.id || !restaurant.name || restaurant.name.length > 200) throw new Error(`第 ${index + 1} 筆餐廳資料不完整。`);
  for (const post of entities.posts!) if (!post?.id || !post.body?.trim() || post.photoAssetIds?.length > 5) throw new Error('文章資料不完整或照片數超過 5 張。');
  const assetFiles = names.filter(n => /^assets\/[a-f0-9]{64}\.webp$/.test(n));
  if (manifest.assetHashes && (manifest.assetHashes.length !== assetFiles.length || manifest.assetHashes.some(hash => !assetFiles.includes(`assets/${hash}.webp`)))) throw new Error('manifest 照片索引與 ZIP 內容不一致。');
  for (const path of assetFiles) {
    const fileEntry = zip.file(path)!; const blobData = await fileEntry.async('uint8array'); const blob = new Blob([blobData], { type: 'image/webp' });
    if (!/^assets\/[a-f0-9]{64}\.webp$/.test(path) || blob.size > 500 * 1024) throw new Error('照片路徑或大小不符合格式。');
    const sha = path.slice(7, -5); const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); const actual = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
    if (sha !== actual || blob.type !== 'image/webp') throw new Error('照片 Hash 或格式驗證失敗。');
    const image = await createImageBitmap(blob); const now = new Date().toISOString(); const meta = revisions.assets.find(item => item.sha256 === sha); assets.push({ id: meta?.id ?? sha, sha256: sha, mimeType: 'image/webp', bytes: blob.size, width: image.width, height: image.height, blob, createdAt: meta?.createdAt ?? now, updatedAt: meta?.updatedAt ?? now, createdByProfileId: meta?.createdByProfileId ?? '', revisionId: meta?.revisionId ?? crypto.randomUUID(), parentRevisionIds: meta?.parentRevisionIds ?? [] }); image.close();
  }
  const assetIds = new Set(assets.map(asset => asset.id)); const restaurantIds = new Set(entities.restaurants!.map(r => r.id)); const profileIds = new Set((manifest.profiles as { id: string }[]).map(p => p.id));
  if (entities.wishlists!.some(row => !restaurantIds.has(row.restaurantId) || !profileIds.has(row.profileId)) || entities.ratings!.some(row => !restaurantIds.has(row.restaurantId) || !profileIds.has(row.profileId)) || entities.posts!.some(row => !restaurantIds.has(row.restaurantId))) throw new Error('備份中的資料關聯無效。');
  if (entities.posts!.some(row => row.photoAssetIds.some(assetId => !assetIds.has(assetId))) || entities.restaurants!.some(row => row.coverAssetId && !assetIds.has(row.coverAssetId))) throw new Error('備份參照了不存在的照片。');
  const bundle: Bundle = { restaurants: entities.restaurants!, wishlists: entities.wishlists!, ratings: entities.ratings!, posts: entities.posts!, assets, options: entities.options ?? [] };
  const datasetRow = await db.settings.get('dataset'); const currentDataset = datasetRow?.value as { id:string } | undefined;
  const snapshot: SyncSnapshot = await normalizeSnapshotOptions({ datasetId:manifest.datasetId, profiles:manifest.profiles as Dataset['profiles'], entities:{restaurants:bundle.restaurants,wishlists:bundle.wishlists,ratings:bundle.ratings,posts:bundle.posts}, assets:bundle.assets, options:bundle.options, optionDeletions:manifest.optionDeletions }, manifest.profiles as Dataset['profiles']);
  const plan = await planMerge(snapshot,true);
  const counts = { restaurants:0, wishlists:0, ratings:0, posts:0, assets:0, options:0, conflicts:plan.conflicts.length, updates:plan.update, same:plan.same };
  for (const key of ['restaurants','wishlists','ratings','posts','assets','options'] as const) { const table=key==='options'?db.catalogOptions:db[key]; for(const row of bundle[key]) if(!await table.get(row.id)) counts[key]++; }
  return { manifest, bundle, counts, snapshot, plan, sameDataset:!currentDataset||currentDataset.id===manifest.datasetId };
}
export async function applyZipImport(preview: Awaited<ReturnType<typeof inspectZip>>, mode: 'merge' | 'restore' = 'merge', choices: ConflictChoice = {}) {
  const plan: MergePlan = await planMerge(preview.snapshot,mode==='restore');
  const decisions={...choices};
  if(mode==='merge') for(const conflict of plan.conflicts) {
    const remote=conflict.remote as {name?:string;body?:string}; const local=conflict.local as {name?:string;body?:string};
    const label=remote.name??remote.body??conflict.id;
    decisions[conflict.key]=confirm(`「${String(label).slice(0,80)}」在兩份資料中都有不同修改。\n\n本機：${String(local.name??local.body??'').slice(0,120)}\n\n對方：${String(remote.name??remote.body??'').slice(0,120)}\n\n按「確定」使用對方版本；按「取消」保留本機版本。`)?'remote':'local';
  }
  await applyMerge(plan,decisions,mode);
}
