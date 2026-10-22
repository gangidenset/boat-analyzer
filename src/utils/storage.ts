import type { z } from 'zod';

/**
 * localStorage の安全なラッパー。
 * プライベートブラウズ等で例外が出たり、値が壊れていても既定値で動作を続ける。
 */
export function loadJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
