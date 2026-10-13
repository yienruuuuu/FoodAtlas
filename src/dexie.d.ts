declare module 'dexie' {
  export interface Table<T, TKey = string> {
    toArray(): Promise<T[]>;
    get(key: TKey): Promise<T | undefined>;
    put(value: T): Promise<TKey>;
    add(value: T): Promise<TKey>;
    count(): Promise<number>;
    clear(): Promise<void>;
    delete(key: TKey): Promise<void>;
    bulkDelete(keys: TKey[]): Promise<void>;
    each(callback: (row: T) => void): Promise<void>;
    where(index: string): WhereClause<T>;
  }

  export interface WhereClause<T> {
    equals(value: unknown): Collection<T>;
  }

  export interface Collection<T> {
    first(): Promise<T | undefined>;
  }

  export interface Version {
    stores(schema: Record<string, string>): Version;
  }

  export default class Dexie {
    tables: Table<unknown, unknown>[];
    constructor(name: string);
    version(version: number): Version;
    transaction<T>(mode: string, ...tablesAndScope: unknown[]): Promise<T>;
  }
  export function liveQuery<T>(query: () => T | Promise<T>): {
    subscribe(observer: { next(value: T): void; error(error: unknown): void }): { unsubscribe(): void };
  };
}
