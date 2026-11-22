const STORAGE_KEY = 'wt.accessKey';

// Если localStorage недоступен (приватный режим), ключ живёт до перезагрузки страницы.
let memoryKey: string | null = null;

export function getAccessKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

export function setAccessKey(key: string): void {
  memoryKey = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // см. memoryKey
  }
}

const listeners = new Set<() => void>();

/** Подписка на «сервер потребовал ключ» (401 UNAUTHORIZED). Возвращает отписку. */
export function onAccessKeyRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAccessKeyRequired(): void {
  listeners.forEach((listener) => listener());
}
