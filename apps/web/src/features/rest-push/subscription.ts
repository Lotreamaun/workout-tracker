import { getBrowserStorage, type TimerStorage } from '@/features/sessions/restTimer';

/** Локальная запись о подписке этой установки: id на сервере, endpoint и ключ, которым подписывались. */
export interface RestPushRecord {
  id: string;
  endpoint: string;
  publicKey: string;
}

const RECORD_KEY = 'wt:restPush:subscription';

export function saveRestPushRecord(storage: TimerStorage | null, record: RestPushRecord): void {
  try {
    storage?.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // приватный режим или переполнение — состояние не переживёт перезагрузку
  }
}

export function loadRestPushRecord(storage: TimerStorage | null): RestPushRecord | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(RECORD_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { id, endpoint, publicKey } = value as Record<string, unknown>;
    if (typeof id !== 'string' || typeof endpoint !== 'string' || typeof publicKey !== 'string') return null;
    if (!id || !endpoint || !publicKey) return null;
    return { id, endpoint, publicKey };
  } catch {
    return null;
  }
}

export function clearRestPushRecord(storage: TimerStorage | null): void {
  try {
    storage?.removeItem(RECORD_KEY);
  } catch {
    // см. saveRestPushRecord
  }
}

/** Декодирует base64url без паддинга (формат applicationServerKey) в байты. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

/** Минимальный профиль подписки, чтобы сверку можно было тестировать без DOM. */
export interface PushSubscriptionLike {
  options: { applicationServerKey?: unknown };
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

/** Совпадает ли ключ браузерной подписки с текущим открытым ключом VAPID. */
export function subscriptionMatchesKey(
  subscription: PushSubscriptionLike,
  applicationServerKey: Uint8Array,
): boolean {
  const bytes = toBytes(subscription.options.applicationServerKey);
  if (bytes === null) return false;
  if (bytes.length !== applicationServerKey.length) return false;
  return applicationServerKey.every((byte, index) => bytes[index] === byte);
}

/** localStorage для записи подписки, если он доступен. */
export function restPushStorage(): TimerStorage | null {
  return getBrowserStorage();
}
