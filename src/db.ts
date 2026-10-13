import Dexie, { type Table } from 'dexie';
import type { Asset, CatalogOption, Dataset, Restaurant, RestaurantPost, RestaurantProfileRating, Wishlist } from './types';

export class FoodAtlasDB extends Dexie {
  restaurants!: Table<Restaurant, string>; wishlists!: Table<Wishlist, string>; ratings!: Table<RestaurantProfileRating, string>; posts!: Table<RestaurantPost, string>; assets!: Table<Asset, string>; catalogOptions!: Table<CatalogOption, string>; settings!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super('food-atlas');
    this.version(1).stores({ restaurants: 'id, updatedAt, *categoryTags', wishlists: 'id, &[restaurantId+profileId], restaurantId, profileId', ratings: 'id, &[restaurantId+profileId], restaurantId, profileId', posts: 'id, restaurantId, createdAt, isPinned', assets: 'id, sha256', settings: 'key' });
    this.version(2).stores({ restaurants: 'id, updatedAt, *categoryTags', wishlists: 'id, &[restaurantId+profileId], restaurantId, profileId', ratings: 'id, &[restaurantId+profileId], restaurantId, profileId', posts: 'id, restaurantId, createdAt, isPinned', assets: 'id, sha256', options: 'id, kind, label, archivedAt', settings: 'key' });
    this.version(3).stores({ restaurants: 'id, updatedAt, *categoryTags', wishlists: 'id, &[restaurantId+profileId], restaurantId, profileId', ratings: 'id, &[restaurantId+profileId], restaurantId, profileId', posts: 'id, restaurantId, createdAt, isPinned', assets: 'id, sha256', options: 'id, kind, label, archivedAt', catalogOptions: 'id, kind, label, archivedAt', settings: 'key' });
  }
}
export const db = new FoodAtlasDB();
const uid = () => crypto.randomUUID();
export const newRevision = (parentRevisionId?: string) => ({ revisionId: uid(), parentRevisionIds: parentRevisionId ? [parentRevisionId] : [] as string[] });
export async function initializeDataset(): Promise<Dataset> {
  let dataset = await db.settings.get('dataset');
  if (!dataset) {
    const profiles: Dataset['profiles'] = [{ id: uid(), displayName: '我' }, { id: uid(), displayName: '佩' }];
    const value: Dataset = { id: uid(), profiles, currentProfileId: profiles[0].id };
    await db.settings.put({ key: 'dataset', value }); dataset = { key: 'dataset', value };
    await db.settings.put({ key: 'deviceId', value: uid() });
  }
  const value = dataset.value as Dataset;
  if (!value.currentProfileId) value.currentProfileId = value.profiles[0].id;
  let profilesChanged = false;
  for (const profile of value.profiles) if (profile.displayName === '夥伴') { profile.displayName = '佩'; profilesChanged = true; }
  if (profilesChanged) await db.settings.put({ key: 'dataset', value });
  return value;
}
export async function updateEntity<T extends { id: string; revisionId: string; parentRevisionIds: string[]; updatedAt: string }>(table: Table<T, string>, current: T, changes: Partial<T>) {
  const next = { ...current, ...changes, updatedAt: new Date().toISOString(), parentRevisionIds: [current.revisionId], revisionId: uid() } as T;
  await table.put(next); return next;
}
