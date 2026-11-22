import { exerciseNameKey } from '@wt/shared';

/** Подсказки из библиотеки: совпадения по ключу имени, без полного совпадения и без повторов. */
export function suggestNames(names: string[], input: string, limit = 5): string[] {
  const key = exerciseNameKey(input);
  if (key.length < 2 || limit <= 0) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const nameKey = exerciseNameKey(name);
    if (nameKey === key || !nameKey.includes(key) || seen.has(nameKey)) continue;
    seen.add(nameKey);
    result.push(name);
    if (result.length === limit) break;
  }
  return result;
}
