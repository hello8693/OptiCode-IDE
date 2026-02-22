import { Injectable } from '@opensumi/di';

import { IStorageData, IStorageService } from '../../common/types';

const STORAGE_KEY = 'opticode.storage';

function isObject(value: unknown): value is Record<string, IStorageData> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class WebStorageService implements IStorageService {
  private cache: Record<string, IStorageData> = Object.create(null);
  private initialized = false;
  private storageAvailable = typeof window !== 'undefined' && !!window.localStorage;

  private ensureInit() {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.storageAvailable) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isObject(parsed)) {
        this.cache = parsed;
      }
    } catch {
      // ignore
    }
  }

  private flush() {
    if (!this.storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
    } catch {
      // ignore
    }
  }

  getItem<T>(key: string, defaultValue: T): T;
  getItem<T>(key: string, defaultValue?: T): T | undefined;
  getItem<T>(key: string, defaultValue?: T): T | undefined {
    this.ensureInit();
    const value = this.cache[key];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value as T;
  }

  setItem(key: string, data?: IStorageData): void {
    this.setItems([{ key, data }]);
  }

  setItems(items: readonly { key: string; data?: IStorageData }[]): void {
    this.ensureInit();
    let changed = false;
    for (const { key, data } of items) {
      const next = data === undefined || data === null ? undefined : data;
      if (this.cache[key] === next) continue;
      if (next === undefined) {
        if (this.cache[key] !== undefined) {
          delete this.cache[key];
          changed = true;
        }
      } else {
        this.cache[key] = next;
        changed = true;
      }
    }
    if (changed) {
      this.flush();
    }
  }

  removeItem(key: string): void {
    this.ensureInit();
    if (this.cache[key] !== undefined) {
      delete this.cache[key];
      this.flush();
    }
  }

  async close(): Promise<void> {
    this.flush();
  }
}
