import { db, initializeDataset } from './db';
import type { Asset, CatalogOption, Dataset, Restaurant, RestaurantPost, RestaurantProfileRating, Wishlist } from './types';
import { normalizeSnapshotOptions } from './catalog';
import { deletedOptionIds, purgeOptionIds, removeOptionReferences } from './optionDeletion';

export interface SyncEntities {
  restaurants: Restaurant[];
  wishlists: Wishlist[];
  ratings: RestaurantProfileRating[];
  posts: RestaurantPost[];
}
export interface SyncSnapshot { datasetId: string; profiles: Dataset['profiles']; entities: SyncEntities; assets: Asset[]; options: CatalogOption[]; optionDeletions?: string[] }
export type SyncEntityType = keyof SyncEntities | 'assets' | 'options';
export interface SyncConflict { key: string; type: SyncEntityType; id: string; local: unknown; remote: unknown }
export interface MergePlan { add: number; update: number; same: number; conflicts: SyncConflict[]; snapshot: SyncSnapshot }
export type ConflictChoice = Record<string, 'local' | 'remote'>;

export async function exportSnapshot(): Promise<SyncSnapshot> {
  const dataset = await initializeDataset();
  const [restaurants, wishlists, ratings, posts, assets, options] = await Promise.all([db.restaurants.toArray(), db.wishlists.toArray(), db.ratings.toArray(), db.posts.toArray(), db.assets.toArray(), db.catalogOptions.toArray()]);
  return { datasetId: dataset.id, profiles: dataset.profiles, entities: { restaurants, wishlists, ratings, posts }, assets, options, optionDeletions: await deletedOptionIds() };
}

function planRows<T extends { id: string; revisionId: string; parentRevisionIds: string[] }>(type: SyncEntityType, localRows: T[], remoteRows: T[]) {
  const local = new Map(localRows.map(row => [row.id, row])); let add = 0; let update = 0; let same = 0; const conflicts: SyncConflict[] = [];
  for (const remote of remoteRows) {
    const current = local.get(remote.id);
    if (!current) { add++; continue; }
    if (current.revisionId === remote.revisionId) { same++; continue; }
    if (remote.parentRevisionIds.includes(current.revisionId)) { update++; continue; }
    if (current.parentRevisionIds.includes(remote.revisionId)) { same++; continue; }
    conflicts.push({ key: `${type}:${remote.id}`, type, id: remote.id, local: current, remote });
  }
  return { add, update, same, conflicts };
}

export async function planMerge(snapshot: SyncSnapshot, allowDifferentDataset = false): Promise<MergePlan> {
  if (snapshot.optionDeletions !== undefined && (!Array.isArray(snapshot.optionDeletions) || snapshot.optionDeletions.some(id => typeof id !== 'string' || !id || id.length > 200))) throw new Error('選項刪除紀錄格式不正確。');
  const localDataset = (await db.settings.get('dataset'))?.value as Dataset | undefined;
  const localDeletions = !localDataset || localDataset.id === snapshot.datasetId ? await deletedOptionIds() : [];
  snapshot = await normalizeSnapshotOptions({ ...snapshot, optionDeletions: [...new Set([...localDeletions, ...(snapshot.optionDeletions ?? [])])] }, snapshot.profiles);
  await validateSnapshot(snapshot);
  const datasetRow = await db.settings.get('dataset');
  const dataset = datasetRow?.value as Dataset | undefined;
  const hasData = (await Promise.all([db.restaurants.count(),db.wishlists.count(),db.ratings.count(),db.posts.count(),db.assets.count(),db.catalogOptions.count()])).some(count=>count>0);
  if (!allowDifferentDataset && dataset && dataset.id !== snapshot.datasetId && hasData) throw new Error('此資料屬於另一個家庭圖鑑。');
  const [restaurants, wishlists, ratings, posts, assets, options] = await Promise.all([db.restaurants.toArray(), db.wishlists.toArray(), db.ratings.toArray(), db.posts.toArray(), db.assets.toArray(), db.catalogOptions.toArray()]);
  const parts = [planRows('restaurants', restaurants, snapshot.entities.restaurants), planRows('wishlists', wishlists, snapshot.entities.wishlists), planRows('ratings', ratings, snapshot.entities.ratings), planRows('posts', posts, snapshot.entities.posts), planRows('assets', assets, snapshot.assets), planRows('options', options, snapshot.options)];
  return { add: parts.reduce((n, p) => n + p.add, 0), update: parts.reduce((n, p) => n + p.update, 0), same: parts.reduce((n, p) => n + p.same, 0), conflicts: parts.flatMap(p => p.conflicts), snapshot };
}

export async function applyMerge(plan: MergePlan, choices: ConflictChoice = {}, mode: 'merge' | 'restore' = 'merge') {
  const { snapshot } = plan;
  if (mode === 'merge' && plan.conflicts.some(conflict => !choices[conflict.key])) throw new Error('請先為每筆並行修改選擇要保留的版本。');
  const deletedIds = new Set(snapshot.optionDeletions ?? []);
  const affected = (await db.restaurants.toArray()).filter(row => !row.deletedAt && removeOptionReferences(row, deletedIds) !== row);
  if (affected.length) {
    const names = affected.map(row => '・' + row.name).join('\n');
    if (!confirm('本次匯入／同步會移除以下餐廳使用的已刪除選項：\n\n' + names + '\n\n是否繼續？') ||
        !confirm('再次確認：刪除這些選項及餐廳上的關聯，且不保留封存資料？')) throw new Error('已取消套用資料。');
  }
  const tables = [db.restaurants, db.wishlists, db.ratings, db.posts, db.assets, db.catalogOptions, db.settings];
  await db.transaction('rw', ...tables, async () => {
    const currentDataset = await db.settings.get('dataset');
    if (mode === 'restore') await Promise.all([db.restaurants.clear(),db.wishlists.clear(),db.ratings.clear(),db.posts.clear(),db.assets.clear(),db.catalogOptions.clear()]);
    if (currentDataset && (currentDataset.value as Dataset).id !== snapshot.datasetId && (mode === 'restore' || !(await db.restaurants.count()))) await db.settings.delete('deletedCatalogOptionIds');
    if (mode === 'restore' || !currentDataset || ((currentDataset.value as Dataset).id !== snapshot.datasetId && !(await db.restaurants.count()))) {
      await db.settings.put({ key: 'dataset', value: { id: snapshot.datasetId, profiles: snapshot.profiles, currentProfileId: snapshot.profiles[0].id } });
    }
    await mergeTable(db.restaurants, snapshot.entities.restaurants, 'restaurants', choices);
    await mergeTable(db.wishlists, snapshot.entities.wishlists, 'wishlists', choices);
    await mergeTable(db.ratings, snapshot.entities.ratings, 'ratings', choices);
    await mergeTable(db.posts, snapshot.entities.posts, 'posts', choices);
    await mergeTable(db.assets, snapshot.assets, 'assets', choices);
    await mergeTable(db.catalogOptions, snapshot.options, 'options', choices);
    await purgeOptionIds(snapshot.optionDeletions ?? []);
  });
}

async function mergeTable<T extends { id: string; revisionId: string; parentRevisionIds: string[] }>(table: { get(id: string): Promise<T | undefined>; put(row: T): Promise<unknown> }, incoming: T[], type: SyncEntityType, choices: ConflictChoice) {
  for (const remote of incoming) {
    const current = await table.get(remote.id);
    if (!current) { await table.put(remote); continue; }
    if (current.revisionId === remote.revisionId || current.parentRevisionIds.includes(remote.revisionId)) continue;
    if (remote.parentRevisionIds.includes(current.revisionId) || choices[`${type}:${remote.id}`] === 'remote') await table.put(remote);
  }
}

export async function validateSnapshot(snapshot: SyncSnapshot) {
  if (!snapshot?.datasetId || !Array.isArray(snapshot.profiles) || snapshot.profiles.length !== 2) throw new Error('同步摘要格式不正確。');
  if (!snapshot.entities || !['restaurants','wishlists','ratings','posts'].every(key => Array.isArray(snapshot.entities[key as keyof SyncEntities])) || !Array.isArray(snapshot.assets) || !Array.isArray(snapshot.options)) throw new Error('同步資料格式不完整。');
  const restaurants = new Set(snapshot.entities.restaurants.map(item => item.id));
  const profiles = new Set(snapshot.profiles.map(item => item.id));
  const assetIds = new Set(snapshot.assets.map(item => item.id));
  const options = new Set(snapshot.options.map(item => item.id));
  if (snapshot.options.some(option => !option.id || !['category','location','budget','customTag'].includes(option.kind) || !option.label.trim() || (option.kind === 'budget' && option.budgetMin !== undefined && option.budgetMax !== undefined && option.budgetMin > option.budgetMax))) throw new Error('同步選項格式不正確。');
  const optionById=new Map(snapshot.options.map(option=>[option.id,option]));
  if(snapshot.options.some(option=>option.parentOptionId&&(option.kind!=='category'||option.parentOptionId===option.id||optionById.get(option.parentOptionId)?.kind!=='category'||!!optionById.get(option.parentOptionId)?.parentOptionId))) throw new Error('料理類型最多只能分成大類與子類，且子類必須隸屬有效的大類。');
  for (const asset of snapshot.assets) {
    if (asset.bytes !== asset.blob.size || asset.bytes > 500 * 1024 || asset.mimeType !== 'image/webp') throw new Error('同步照片大小或格式不正確。');
    const data = new Uint8Array(await asset.blob.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...data.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...data.slice(8, 12)) !== 'WEBP') throw new Error('同步照片內容驗證失敗。');
    const hash = await crypto.subtle.digest('SHA-256', await asset.blob.arrayBuffer());
    const hex = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hex !== asset.sha256) throw new Error('同步照片 Hash 不符。');
  }
  if (snapshot.entities.wishlists.some(row => !restaurants.has(row.restaurantId) || !profiles.has(row.profileId)) || snapshot.entities.ratings.some(row => !restaurants.has(row.restaurantId) || !profiles.has(row.profileId)) || snapshot.entities.posts.some(row => !restaurants.has(row.restaurantId) || row.photoAssetIds.length > 5 || row.photoAssetIds.some(assetId => !assetIds.has(assetId)))) throw new Error('同步資料關聯無效。');
  if (snapshot.entities.restaurants.some(row => row.coverAssetId && !assetIds.has(row.coverAssetId))) throw new Error('餐廳封面照片不存在。');
  if (snapshot.entities.restaurants.some(row => row.categoryOptionIds?.some(id => !options.has(id)) || row.customTagOptionIds?.some(id => !options.has(id)) || (row.locationOptionId && !options.has(row.locationOptionId)) || (row.budgetOptionId && !options.has(row.budgetOptionId)))) throw new Error('餐廳參照了不存在的選項。');
}
