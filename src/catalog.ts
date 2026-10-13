import { db } from './db';
import { deletionIdsFor, purgeLegacyDeletedOptions, removeOptionReferences } from './optionDeletion';
import type { CatalogOption, CatalogOptionKind, Dataset, Restaurant } from './types';
import type { SyncSnapshot } from './syncEngine';

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const budgetLabel = (min?: number, max?: number) => min === undefined ? `每人 $${max} 以下` : max === undefined ? `每人 $${min} 以上` : `每人 $${min}–$${max}`;
const optionKey = (kind: CatalogOptionKind, label: string, min?: number, max?: number) => kind === 'budget' ? `${kind}|${min ?? ''}|${max ?? ''}` : `${kind}|${clean(label)}`;

async function legacyOption(kind: CatalogOptionKind, label: string, profileId: string, budgetMin?: number, budgetMax?: number): Promise<CatalogOption> {
  const key = optionKey(kind, label, budgetMin, budgetMax); const digest = await hash(key);
  return { id: `legacy-${kind}-${digest}`, kind, label: kind === 'budget' ? budgetLabel(budgetMin, budgetMax) : clean(label), budgetMin, budgetMax, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z', createdByProfileId: profileId, revisionId: `legacy-rev-${digest}`, parentRevisionIds: [] };
}

function findOption(options: CatalogOption[], kind: CatalogOptionKind, label: string, min?: number, max?: number) {
  return options.find(option => option.kind === kind && (kind === 'budget' ? option.budgetMin === min && option.budgetMax === max : clean(option.label) === clean(label)));
}

export function restaurantCustomTags(row: Restaurant, options: CatalogOption[]) {
  const resolved = row.customTagOptionIds?.map(id => options.find(option => option.id === id && !option.deletedAt)?.label).filter((label): label is string => Boolean(label));
  return resolved?.length ? resolved : row.customTags ?? [];
}

async function resolveOrCreate(options: CatalogOption[], kind: CatalogOptionKind, label: string, profileId: string, min?: number, max?: number) {
  const found = findOption(options, kind, label, min, max);
  if (found) return found;
  const created = await legacyOption(kind, label, profileId, min, max); options.push(created); return created;
}

function deterministicRevision(row: Restaurant, categoryIds: string[], locationId?: string, budgetId?: string) {
  return hash(`${row.revisionId}|catalog|${categoryIds.join(',')}|${locationId ?? ''}|${budgetId ?? ''}`);
}

export async function initializeCatalogOptions(dataset: Dataset): Promise<CatalogOption[]> {
  await db.transaction('rw', db.catalogOptions, db.restaurants, 'options', async (transaction: { table(name: string): { toArray(): Promise<unknown[]>; clear(): Promise<unknown> } }) => {
    const options: CatalogOption[] = await db.catalogOptions.toArray();
    const legacyOptions = await transaction.table('options').toArray() as CatalogOption[];
    for (const legacy of legacyOptions) if (!options.some(option => option.id === legacy.id)) options.push(legacy);
    if (legacyOptions.length) await transaction.table('options').clear();
  for (const restaurant of await db.restaurants.toArray()) {
      const categoryIds: string[] = [];
      for (const [index, label] of (restaurant.categoryTags ?? []).entries()) {
        const currentId = restaurant.categoryOptionIds?.[index];
        const current = options.find(option => option.id === currentId && option.kind === 'category');
        categoryIds.push((current ?? await resolveOrCreate(options, 'category', label, dataset.profiles[0].id)).id);
      }
      const locationOption = options.find(option => option.id === restaurant.locationOptionId && option.kind === 'location');
      const locationId = restaurant.locationText?.trim() ? (locationOption ?? await resolveOrCreate(options, 'location', restaurant.locationText, dataset.profiles[0].id)).id : undefined;
      const budgetOption = options.find(option => option.id === restaurant.budgetOptionId && option.kind === 'budget');
      const budgetId = restaurant.budgetMin !== undefined || restaurant.budgetMax !== undefined ? (budgetOption ?? await resolveOrCreate(options, 'budget', '', dataset.profiles[0].id, restaurant.budgetMin, restaurant.budgetMax)).id : undefined;
      const customIds: string[] = [];
      for (const [index, label] of (restaurant.customTags ?? []).entries()) {
        const currentId = restaurant.customTagOptionIds?.[index];
        const current = options.find(option => option.id === currentId && option.kind === 'customTag');
        customIds.push((current ?? await resolveOrCreate(options, 'customTag', label, dataset.profiles[0].id)).id);
      }
      const changed = !restaurant.categoryOptionIds || restaurant.categoryOptionIds.join('|') !== categoryIds.join('|') || restaurant.locationOptionId !== locationId || restaurant.budgetOptionId !== budgetId || restaurant.customTagOptionIds?.join('|') !== customIds.join('|');
      if (changed) {
        const revisionId = `catalog-ref-${await deterministicRevision(restaurant, categoryIds, locationId, budgetId)}`;
        await db.restaurants.put({ ...restaurant, categoryOptionIds: categoryIds, customTagOptionIds: customIds, locationOptionId: locationId, budgetOptionId: budgetId, parentRevisionIds: [restaurant.revisionId], revisionId });
      }
    }
    if (options.length) await Promise.all(options.map(option => db.catalogOptions.put(option)));
    return options;
  });
  await purgeLegacyDeletedOptions();
  return db.catalogOptions.toArray();
}

export async function normalizeSnapshotOptions(snapshot: SyncSnapshot, profiles: Dataset['profiles']): Promise<SyncSnapshot> {
  const normalized: SyncSnapshot = { ...snapshot, options: [...(snapshot.options ?? [])], entities: { ...snapshot.entities, restaurants: snapshot.entities.restaurants.map(row => ({ ...row })) } };
  const profileId = profiles[0].id;
  for (const row of normalized.entities.restaurants) {
    const categories = row.categoryTags ?? [];
    const ids: string[] = [];
    for (const [index, label] of categories.entries()) {
      const current = normalized.options.find(option => option.id === row.categoryOptionIds?.[index] && option.kind === 'category');
      ids.push((current ?? await resolveOrCreate(normalized.options, 'category', label, profileId)).id);
    }
    const location = normalized.options.find(option => option.id === row.locationOptionId && option.kind === 'location');
    const locationId = row.locationText?.trim() ? (location ?? await resolveOrCreate(normalized.options, 'location', row.locationText, profileId)).id : undefined;
    const budget = normalized.options.find(option => option.id === row.budgetOptionId && option.kind === 'budget');
    const budgetId = row.budgetMin !== undefined || row.budgetMax !== undefined ? (budget ?? await resolveOrCreate(normalized.options, 'budget', '', profileId, row.budgetMin, row.budgetMax)).id : undefined;
    const customIds: string[] = [];
    for (const [index, label] of (row.customTags ?? []).entries()) {
      const current = normalized.options.find(option => option.id === row.customTagOptionIds?.[index] && option.kind === 'customTag');
      customIds.push((current ?? await resolveOrCreate(normalized.options, 'customTag', label, profileId)).id);
    }
    row.categoryOptionIds = ids; row.customTagOptionIds = customIds; row.locationOptionId = locationId; row.budgetOptionId = budgetId;
  }
  const ids = new Set([...(snapshot.optionDeletions ?? []), ...await deletionIdsFor(normalized.options.filter(option => !!option.deletedAt))]);
  normalized.optionDeletions = [...ids];
  normalized.options = normalized.options.filter(option => !ids.has(option.id));
  normalized.entities.restaurants = normalized.entities.restaurants.map(row => removeOptionReferences(row, ids));
  return normalized;
}

export function categoryPath(option: CatalogOption, options: CatalogOption[]) {
  const parent = option.parentOptionId ? options.find(item => item.id === option.parentOptionId && !item.deletedAt) : undefined;
  return parent ? `${parent.label}／${option.label}` : option.label;
}

export function restaurantCategoryOptionIds(row: Restaurant, options: CatalogOption[]) {
  const ids = row.categoryOptionIds?.filter(id => options.some(option => option.id === id && option.kind === 'category' && !option.deletedAt));
  if (ids?.length) return ids;
  return (row.categoryTags ?? []).map(label => options.find(option => option.kind === 'category' && !option.parentOptionId && option.label === label)?.id).filter((id): id is string => Boolean(id));
}

export function restaurantCategories(row: Restaurant, options: CatalogOption[]) {
  const resolved = restaurantCategoryOptionIds(row, options).map(id => {
    const option = options.find(item => item.id === id && !item.deletedAt);
    return option ? categoryPath(option, options) : undefined;
  }).filter((label): label is string => Boolean(label));
  return resolved?.length ? resolved : row.categoryTags ?? [];
}

export function categorySelectionMatches(selectedIds: string[], restaurant: Restaurant, options: CatalogOption[]) {
  if (!selectedIds.length) return true;
  const assigned = new Set(restaurantCategoryOptionIds(restaurant, options));
  return selectedIds.some(id => {
    if (assigned.has(id)) return true;
    return options.some(option => option.kind === 'category' && option.parentOptionId === id && assigned.has(option.id));
  });
}

export function restaurantLocation(row: Restaurant, options: CatalogOption[]) {
  return options.find(option => option.id === row.locationOptionId && !option.deletedAt)?.label ?? row.locationText;
}

export function restaurantBudget(row: Restaurant, options: CatalogOption[]) {
  const option = options.find(item => item.id === row.budgetOptionId && !item.deletedAt);
  return option?.kind === 'budget' ? { min: option.budgetMin, max: option.budgetMax } : { min: row.budgetMin, max: row.budgetMax };
}
