import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { TimerStorage } from '@/features/sessions/restTimer';
import type { RestPushTimerInput } from '@wt/shared';

// timerSync тянет за собой client -> '@/lib/api', который при импорте читает window.location;
// для тестов логики очереди достаточно заглушки модуля.
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly kind: 'network' | 'http',
      message: string,
      public readonly status?: number,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
  apiRequest: () => Promise.resolve(undefined),
  jsonBody: (method: 'POST' | 'PATCH', body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
}));

import { createRestPushTimerSync } from './timerSync';

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

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Даёт микрозадачам отработать (очередь синхронизации полностью в промисах). */
async function settle(steps = 10): Promise<void> {
  for (let i = 0; i < steps; i += 1) await Promise.resolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function callAt(calls: RestPushTimerInput[], index: number): RestPushTimerInput {
  const call = calls[index];
  if (!call) throw new Error(`Ожидался запрос №${index + 1}`);
  return call;
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRestPushTimerSync', () => {
  it('доставляет состояния по одному и в порядке поступления', async () => {
    const calls: Array<{ subscriptionId: string; input: RestPushTimerInput }> = [];
    let releaseFirst!: () => void;
    const sync = createRestPushTimerSync({
      storage: memoryStorage(),
      send: async (subscriptionId, input) => {
        calls.push({ subscriptionId, input });
        if (calls.length === 1) await new Promise<void>((resolve) => (releaseFirst = resolve));
      },
    });

    sync.configure('sub-1');
    sync.schedule('session-1', 1_000);
    sync.schedule('session-1', 5_000);
    await settle();

    // Второе изменение ждёт завершения первого запроса.
    expect(calls.map(({ input }) => input.endsAt)).toEqual([iso(1_000)]);
    releaseFirst();
    await settle();

    expect(calls.map(({ input }) => input.endsAt)).toEqual([iso(1_000), iso(5_000)]);
    expect(calls.map(({ input }) => input.revision)).toEqual([1, 2]);
    expect(calls.every(({ subscriptionId }) => subscriptionId === 'sub-1')).toBe(true);
  });

  it('передаёт null как отмену и держит ревизию в хранилище между загрузками', async () => {
    const storage = memoryStorage();
    const calls: RestPushTimerInput[] = [];
    const first = createRestPushTimerSync({ storage, send: async (_id, input) => { calls.push(input); } });
    first.configure('sub-1');
    first.schedule('session-1', 60_000);
    await settle();
    first.schedule('session-1', null);
    await settle();

    expect(calls.map((input) => input.endsAt)).toEqual([iso(60_000), null]);
    expect(calls.map((input) => input.sessionId)).toEqual(['session-1', 'session-1']);

    // «Перезагрузка»: новый экземпляр продолжает ревизию, а не начинает с 1.
    const second = createRestPushTimerSync({ storage, send: async (_id, input) => { calls.push(input); } });
    second.configure('sub-1');
    second.schedule('session-2', 90_000);
    await settle();

    expect(callAt(calls, 2).revision).toBe(3);
    expect(callAt(calls, 2).sessionId).toBe('session-2');
    expect(storage.getItem('wt:restPush:revision')).toBe('3');
  });

  it('без подписки ничего не отправляет, но помнит актуальное состояние', async () => {
    const calls: RestPushTimerInput[] = [];
    const sync = createRestPushTimerSync({ storage: memoryStorage(), send: async (_id, input) => { calls.push(input); } });

    sync.schedule('session-1', 30_000);
    await settle();
    expect(calls).toEqual([]);

    sync.configure('sub-9');
    await settle();
    expect(calls.map((input) => input.endsAt)).toEqual([iso(30_000)]);
    sync.schedule('session-1', 45_000);
    await settle();
    expect(calls.map((input) => input.endsAt)).toEqual([iso(30_000), iso(45_000)]);
  });

  it('после сбоя повторяет доставку с новой ревизией и сообщает о восстановлении', async () => {
    const storage = memoryStorage();
    const calls: RestPushTimerInput[] = [];
    const events: string[] = [];
    let fail = true;

    const sync = createRestPushTimerSync({
      storage,
      retryDelays: [5],
      send: async (_id, input) => {
        calls.push(input);
        if (fail) throw new ApiError('network', 'Сервер недоступен');
      },
    });
    const unsubscribe = sync.subscribe((event) => events.push(event.type));

    sync.configure('sub-1');
    sync.schedule('session-1', 120_000);
    await settle();
    expect(events).toEqual(['failed']);

    fail = false;
    await sleep(20);
    await settle();

    expect(calls.length).toBe(2);
    expect(callAt(calls, 1).revision).toBeGreaterThan(callAt(calls, 0).revision);
    expect(callAt(calls, 1).endsAt).toBe(iso(120_000));
    expect(events).toEqual(['failed', 'recovered']);

    // Повторная успешная отправка не плодит события.
    sync.schedule('session-1', 180_000);
    await settle();
    expect(events).toEqual(['failed', 'recovered']);
    expect(calls.length).toBe(3);

    unsubscribe();
  });

  it('404 при обновлении таймера означает потерю подписки и останавливает очередь', async () => {
    const calls: RestPushTimerInput[] = [];
    const events: string[] = [];
    const sync = createRestPushTimerSync({
      storage: memoryStorage(),
      retryDelays: [5],
      send: async (_id, input) => {
        calls.push(input);
        throw new ApiError('http', 'Не найдено', 404);
      },
    });
    sync.subscribe((event) => events.push(event.type));

    sync.configure('sub-1');
    sync.schedule('session-1', 60_000);
    await settle();

    expect(events).toEqual(['lost']);
    expect(calls.length).toBe(1);

    // Повторов нет — переподключение в руках интерфейса.
    await sleep(20);
    await settle();
    expect(calls.length).toBe(1);
  });

  it('тихо отбрасывает расписание для закрытой сессии (409)', async () => {
    const calls: RestPushTimerInput[] = [];
    const events: string[] = [];
    let respond409 = false;
    const sync = createRestPushTimerSync({
      storage: memoryStorage(),
      retryDelays: [5],
      send: async (_id, input) => {
        calls.push(input);
        if (respond409) throw new ApiError('http', 'Сессия завершена', 409);
      },
    });
    sync.subscribe((event) => events.push(event.type));

    sync.configure('sub-1');
    sync.schedule('session-1', 60_000);
    await settle();
    expect(events).toEqual([]);

    // Сессию завершили: отмена после этого уже не нужна.
    respond409 = true;
    sync.schedule('session-1', null);
    await settle();
    expect(calls.length).toBe(2);
    expect(events).toEqual([]);

    // Очередь продолжает работать.
    sync.schedule('session-1', 30_000);
    await settle();
    expect(calls.length).toBe(3);
    expect(callAt(calls, 2).endsAt).toBe(iso(30_000));
  });

  it('ревизия всегда положительная и растёт даже с повреждённой записи в хранилище', async () => {
    const storage = memoryStorage();
    storage.setItem('wt:restPush:revision', 'мусор');
    const calls: RestPushTimerInput[] = [];
    const sync = createRestPushTimerSync({ storage, send: async (_id, input) => { calls.push(input); } });

    sync.configure('sub-1');
    sync.schedule('session-1', 1_000);
    await settle();
    expect(callAt(calls, 0).revision).toBe(1);

    // Отрицательные и нечисловые значения не сбрасывают рост.
    storage.setItem('wt:restPush:revision', '-5');
    sync.schedule('session-1', 2_000);
    await settle();
    expect(callAt(calls, 1).revision).toBe(2);
  });

  it('409 по старому запросу не удаляет более новое расписание', async () => {
    const calls: RestPushTimerInput[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const sync = createRestPushTimerSync({
      storage: null,
      send: async (_id, input) => {
        calls.push(input);
        if (calls.length === 1) {
          await first;
          throw new ApiError('http', 'Сессия завершена', 409);
        }
      },
    });
    sync.configure('sub-1');
    sync.schedule('session-1', 60_000);
    sync.schedule('session-2', 90_000);
    releaseFirst();
    await settle();
    expect(calls.map(({ sessionId, revision }) => ({ sessionId, revision }))).toEqual([
      { sessionId: 'session-1', revision: 1 },
      { sessionId: 'session-2', revision: 2 },
    ]);
  });

  it('не отправляет срок, уже истёкший к моменту подключения', async () => {
    const send = vi.fn(async () => {});
    const sync = createRestPushTimerSync({ storage: null, send });
    sync.schedule('session-1', 20_000);
    vi.mocked(Date.now).mockReturnValue(30_000);
    sync.configure('sub-1');
    await settle();
    expect(send).not.toHaveBeenCalled();
  });
});
