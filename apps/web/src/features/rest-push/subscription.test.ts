import { describe, expect, it } from 'vitest';
import type { TimerStorage } from '@/features/sessions/restTimer';
import {
  clearRestPushRecord,
  loadRestPushRecord,
  saveRestPushRecord,
  subscriptionMatchesKey,
  urlBase64ToUint8Array,
  type RestPushRecord,
} from './subscription';

function memoryStorage(overrides: Partial<TimerStorage> = {}): TimerStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    ...overrides,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('urlBase64ToUint8Array', () => {
  it('декодирует base64url без паддинга в те же байты', () => {
    const key = new Uint8Array([0x04, ...Array.from({ length: 64 }, (_, index) => index)]);
    expect(Array.from(urlBase64ToUint8Array(toBase64Url(key)))).toEqual(Array.from(key));
  });

  it('декодирует строки, длина которых кратна 4, без добавления паддинга', () => {
    const raw = 'QUJD'; // ABC
    expect(Array.from(urlBase64ToUint8Array(raw))).toEqual([65, 66, 67]);
    expect(urlBase64ToUint8Array('QUJD').length).toBe(3);
  });

  it('не ломается на пустой строке', () => {
    expect(urlBase64ToUint8Array('')).toEqual(new Uint8Array(0));
  });
});

describe('subscriptionMatchesKey', () => {
  const key = urlBase64ToUint8Array(toBase64Url(new Uint8Array([0x04, 1, 2, 3, 4])));

  it('совпадает при том же ключе в виде ArrayBuffer и Uint8Array', () => {
    const sameBytes = new Uint8Array([0x04, 1, 2, 3, 4]);
    expect(subscriptionMatchesKey({ options: { applicationServerKey: sameBytes.buffer.slice(0) } }, key)).toBe(true);
    expect(subscriptionMatchesKey({ options: { applicationServerKey: sameBytes } }, key)).toBe(true);
  });

  it('не совпадает при другом ключе, другой длине или отсутствии ключа', () => {
    expect(subscriptionMatchesKey({ options: { applicationServerKey: new Uint8Array([9, 9, 9]) } }, key)).toBe(false);
    expect(
      subscriptionMatchesKey({ options: { applicationServerKey: new Uint8Array([0x04, 1, 2, 3, 5]) } }, key),
    ).toBe(false);
    expect(subscriptionMatchesKey({ options: { applicationServerKey: null } }, key)).toBe(false);
    expect(subscriptionMatchesKey({ options: { applicationServerKey: undefined } }, key)).toBe(false);
    expect(subscriptionMatchesKey({ options: { applicationServerKey: 'not-bytes' } }, key)).toBe(false);
  });
});

describe('saveRestPushRecord / loadRestPushRecord / clearRestPushRecord', () => {
  const record: RestPushRecord = { id: 'sub-1', endpoint: 'https://push.apple.com/x', publicKey: 'KEY' };

  it('сохраняет и читает запись подписки', () => {
    const storage = memoryStorage();
    saveRestPushRecord(storage, record);
    expect(loadRestPushRecord(storage)).toEqual(record);
  });

  it('удаляет запись', () => {
    const storage = memoryStorage();
    saveRestPushRecord(storage, record);
    clearRestPushRecord(storage);
    expect(loadRestPushRecord(storage)).toBeNull();
  });

  it('отвергает мусорные и неполные записи', () => {
    const storage = memoryStorage();
    for (const raw of ['не json', '{', 'null', '{}', '{"id":"1"}', '{"id":"","endpoint":"e","publicKey":"k"}']) {
      storage.setItem('wt:restPush:subscription', raw);
      expect(loadRestPushRecord(storage)).toBeNull();
    }
    expect(loadRestPushRecord(memoryStorage())).toBeNull();
    expect(loadRestPushRecord(null)).toBeNull();
  });

  it('не бросает исключения на недоступном хранилище', () => {
    const throwing = memoryStorage({
      getItem: () => {
        throw new Error('Storage недоступен');
      },
      setItem: () => {
        throw new Error('Storage переполнен');
      },
      removeItem: () => {
        throw new Error('Storage недоступен');
      },
    });
    expect(() => saveRestPushRecord(throwing, record)).not.toThrow();
    expect(loadRestPushRecord(throwing)).toBeNull();
    expect(() => clearRestPushRecord(throwing)).not.toThrow();
    expect(() => saveRestPushRecord(null, record)).not.toThrow();
    expect(() => clearRestPushRecord(null)).not.toThrow();
  });
});
