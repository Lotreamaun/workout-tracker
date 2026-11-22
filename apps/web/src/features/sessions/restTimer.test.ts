import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REST_ADD_MS,
  addTime,
  advanceTimer,
  formatRemaining,
  getRemainingMs,
  parseTimer,
  restStorageKey,
  restoreTimer,
  saveTimer,
  startTimer,
  type RestTimerState,
  type TimerStorage,
} from './restTimer';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('getRemainingMs', () => {
  it('считает остаток до целевого timestamp и обнуляет на границе и после неё', () => {
    expect(getRemainingMs(10_000, 3_000)).toBe(7_000);
    expect(getRemainingMs(10_000, 9_999)).toBe(1);
    expect(getRemainingMs(10_000, 10_000)).toBe(0);
    expect(getRemainingMs(10_000, 10_001)).toBe(0);
    expect(getRemainingMs(10_000, 1_000_000)).toBe(0);
  });
});

describe('startTimer', () => {
  it('устанавливает конец через duration и округляет секунды до миллисекунд', () => {
    expect(startTimer(120, 1_000)).toEqual({ endsAt: 121_000, durationMs: 120_000 });
    expect(startTimer(1.5, 0)).toEqual({ endsAt: 1_500, durationMs: 1_500 });
    expect(startTimer(0, 1_000)).toEqual({ endsAt: 1_000, durationMs: 0 });
    expect(startTimer(-10, 1_000)).toEqual({ endsAt: 1_000, durationMs: 0 });
  });
});

describe('addTime', () => {
  it('сдвигает окончание идущего таймера на 15 с, увеличивая длительность', () => {
    const state = startTimer(120, 1_000);
    const added = addTime(state, 31_000);
    expect(REST_ADD_MS).toBe(15_000);
    expect(added).toEqual({ endsAt: state.endsAt + 15_000, durationMs: 135_000 });
    expect(getRemainingMs(added.endsAt, 31_000)).toBe(105_000);
    expect(getRemainingMs(state.endsAt, 31_000)).toBe(90_000);
  });

  it('истёкший таймер запускает новый отсчёт от текущего времени', () => {
    const expired = { endsAt: 2_000, durationMs: 120_000 };
    expect(addTime(expired, 5_000)).toEqual({ endsAt: 20_000, durationMs: 15_000 });
    expect(addTime(expired, 2_000)).toEqual({ endsAt: 17_000, durationMs: 15_000 });
    expect(addTime(expired, 5_000, 5_000)).toEqual({ endsAt: 10_000, durationMs: 5_000 });
  });
});

describe('advanceTimer', () => {
  const state = startTimer(10, 0);

  it('не завершает таймер до дедлайна', () => {
    expect(advanceTimer(state, 9_999)).toEqual({ state, justFinished: false });
  });

  it('сообщает о завершении ровно один раз и снимает состояние', () => {
    let current: RestTimerState | null = state;
    expect(advanceTimer(current, 5_000)).toEqual({ state, justFinished: false });

    const finished = advanceTimer(current, 10_000);
    expect(finished).toEqual({ state: null, justFinished: true });
    current = finished.state;

    expect(advanceTimer(current, 10_000)).toEqual({ state: null, justFinished: false });
    expect(advanceTimer(current, 60_000)).toEqual({ state: null, justFinished: false });
  });
});

describe('parseTimer', () => {
  it('читает корректную запись', () => {
    expect(parseTimer(JSON.stringify({ endsAt: 12_345, durationMs: 5_000 }))).toEqual({
      endsAt: 12_345,
      durationMs: 5_000,
    });
  });

  it('возвращает null для мусорного JSON, null и отсутствующих полей', () => {
    for (const raw of ['не json', '{', 'null', '[]', '42', '""', '{}', '{"endsAt":"123","durationMs":5000}']) {
      expect(parseTimer(raw)).toBeNull();
    }
    expect(parseTimer(null)).toBeNull();
  });

  it('отвергает NaN, бесконечности и неположительную длительность', () => {
    for (const raw of [
      '{"endsAt":NaN,"durationMs":1000}',
      JSON.stringify({ endsAt: 1_000, durationMs: NaN }),
      JSON.stringify({ endsAt: Number.POSITIVE_INFINITY, durationMs: 1_000 }),
      JSON.stringify({ endsAt: 1_000, durationMs: Number.NEGATIVE_INFINITY }),
      JSON.stringify({ endsAt: 1_000, durationMs: 0 }),
      JSON.stringify({ endsAt: 1_000, durationMs: -1 }),
    ]) {
      expect(parseTimer(raw)).toBeNull();
    }
  });
});

describe('saveTimer / restoreTimer', () => {
  it('сохраняет под ключом сессии и восстанавливает идущий таймер', () => {
    const storage = memoryStorage();
    const state = startTimer(120, 10_000);
    expect(restStorageKey('session-1')).toBe('wt:rest:session-1');

    saveTimer(storage, 'session-1', state);
    expect(storage.getItem('wt:rest:session-1')).toBe(JSON.stringify(state));
    expect(restoreTimer(storage, 'session-1', 20_000)).toEqual(state);
  });

  it('удаляет истёкший таймер при восстановлении', () => {
    const storage = memoryStorage();
    saveTimer(storage, 'session-1', { endsAt: 20_000, durationMs: 120_000 });

    expect(restoreTimer(storage, 'session-1', 20_000)).toBeNull();
    expect(storage.getItem('wt:rest:session-1')).toBeNull();
    expect(restoreTimer(storage, 'session-1', 10_000)).toBeNull();
  });

  it('удаляет повреждённую запись при восстановлении', () => {
    const storage = memoryStorage();
    storage.setItem('wt:rest:session-1', '{');

    expect(restoreTimer(storage, 'session-1', 10_000)).toBeNull();
    expect(storage.getItem('wt:rest:session-1')).toBeNull();
  });

  it('не падает на отсутствующем или бросающем исключения хранилище', () => {
    expect(() => saveTimer(null, 'session-1', startTimer(10, 0))).not.toThrow();
    expect(() => saveTimer(null, 'session-1', null)).not.toThrow();
    expect(restoreTimer(null, 'session-1', 0)).toBeNull();

    const throwing = memoryStorage({
      getItem: () => {
        throw new Error('Storage недоступен');
      },
    });
    expect(restoreTimer(throwing, 'session-1', 0)).toBeNull();

    const throwingWrite = memoryStorage({
      setItem: () => {
        throw new Error('Storage переполнен');
      },
      removeItem: () => {
        throw new Error('Storage недоступен');
      },
    });
    expect(() => saveTimer(throwingWrite, 'session-1', startTimer(10, 0))).not.toThrow();
    expect(() => saveTimer(throwingWrite, 'session-1', null)).not.toThrow();
    expect(() => restoreTimer(throwingWrite, 'session-1', 0)).not.toThrow();
  });
});

describe('formatRemaining', () => {
  it('округляет остаток вверх до секунды и форматирует как м:сс', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-500)).toBe('0:00');
    expect(formatRemaining(1)).toBe('0:01');
    expect(formatRemaining(1_000)).toBe('0:01');
    expect(formatRemaining(1_001)).toBe('0:02');
    expect(formatRemaining(59_500)).toBe('1:00');
    expect(formatRemaining(61_000)).toBe('1:01');
    expect(formatRemaining(120_000)).toBe('2:00');
  });
});

describe('сценарий spec: возврат из фона', () => {
  it('таймер на 120 с после 60 с в фоне показывает около 60 с', () => {
    vi.useFakeTimers();
    const launchedAt = Date.parse('2026-01-01T10:00:00.000Z');
    vi.setSystemTime(launchedAt);
    const storage = memoryStorage();

    const state = startTimer(120, Date.now());
    saveTimer(storage, 'session-1', state);
    expect(getRemainingMs(state.endsAt, Date.now())).toBe(120_000);

    // JS в фоне замирает, но настенные часы идут: при возврате читаем endsAt заново.
    vi.setSystemTime(launchedAt + 60_000);
    const restored = restoreTimer(storage, 'session-1', Date.now());
    expect(restored).toEqual(state);
    const remaining = getRemainingMs(restored!.endsAt, Date.now());
    expect(remaining).toBe(60_000);
    expect(formatRemaining(remaining)).toBe('1:00');
    expect(advanceTimer(restored, Date.now()).justFinished).toBe(false);

    vi.advanceTimersByTime(60_000);
    expect(getRemainingMs(restored!.endsAt, Date.now())).toBe(0);
    expect(formatRemaining(getRemainingMs(restored!.endsAt, Date.now()))).toBe('0:00');
    expect(advanceTimer(restored, Date.now()).justFinished).toBe(true);
  });
});
