import { db, newRevision } from './db';
import type { CatalogOption, Restaurant } from './types';

const deletionKey = 'deletedCatalogOptionIds';

export async function deletedOptionIds(): Promise<string[]> {
  const row = await db.settings.get(deletionKey);
  return Array.isArray(row?.value) ? row.value.filter((id): id is string => typeof id === 'string') : [];
}

// Keep only opaque IDs for propagation; remove labels, budgets and archived records.
export async function deletionIdsFor(options: CatalogOption[]): Promise<string[]> {
  const ids = await Promise.all(options.map(async option => {
    const value = option.kind === 'budget'
      ? `budget|${option.budgetMin ?? ''}|${option.budgetMax ?? ''}`
      : option.kind === 'category' && option.parentOptionId
        ? `category|${option.parentOptionId}|${option.label.trim().replace(/\s+/g, ' ')}`
        : `${option.kind}|${option.label.trim().replace(/\s+/g, ' ')}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return [option.id, `legacy-${option.kind}-${hex}`];
  }));
  return [...new Set(ids.flat())];
}

export function removeOptionReferences(row: Restaurant, ids: ReadonlySet<string>): Restaurant {
  const categoryIndexes = new Set((row.categoryOptionIds ?? []).flatMap((id, index) => ids.has(id) ? [index] : []));
  const customIndexes = new Set((row.customTagOptionIds ?? []).flatMap((id, index) => ids.has(id) ? [index] : []));
  const location = !!row.locationOptionId && ids.has(row.locationOptionId);
  const budget = !!row.budgetOptionId && ids.has(row.budgetOptionId);
  if (!categoryIndexes.size && !customIndexes.size && !location && !budget) return row;
  return { ...row,
    categoryOptionIds: row.categoryOptionIds?.filter((_, i) => !categoryIndexes.has(i)),
    categoryTags: row.categoryTags.filter((_, i) => !categoryIndexes.has(i)),
    customTagOptionIds: row.customTagOptionIds?.filter((_, i) => !customIndexes.has(i)),
    customTags: row.customTags?.filter((_, i) => !customIndexes.has(i)),
    locationOptionId: location ? undefined : row.locationOptionId,
    locationText: location ? '' : row.locationText,
    budgetOptionId: budget ? undefined : row.budgetOptionId,
    budgetMin: budget ? undefined : row.budgetMin,
    budgetMax: budget ? undefined : row.budgetMax,
  };
}

/** Caller includes settings, catalogOptions and restaurants in its write transaction. */
export async function purgeOptionIds(incoming: string[]) {
  const ids = new Set([...(await deletedOptionIds()), ...incoming]);
  if (!ids.size) return;
  await db.settings.put({ key: deletionKey, value: [...ids] });
  for (const row of await db.restaurants.toArray()) {
    const clean = removeOptionReferences(row, ids);
    if (clean !== row) await db.restaurants.put({ ...clean, updatedAt: new Date().toISOString(), ...newRevision(row.revisionId) });
  }
  await db.catalogOptions.bulkDelete([...ids]);
}

export async function purgeLegacyDeletedOptions() {
  const rows = await db.catalogOptions.toArray();
  const ids = await deletionIdsFor(rows.filter(option => !!option.deletedAt));
  await db.transaction('rw', db.catalogOptions, db.restaurants, db.settings, () => purgeOptionIds(ids));
}
