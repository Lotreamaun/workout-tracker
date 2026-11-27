import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../../public/rest-push-sw.js', import.meta.url), 'utf8');
const origin = 'https://tracker.example';
const sessionId = '97158d84-5927-4ec0-a9c0-add7c88535fc';

function makeWorker() {
  type Event = {
    data?: { json: () => unknown };
    notification?: { tag: string; data: unknown; close: () => void };
    waitUntil: (operation: Promise<unknown>) => void;
  };
  const listeners = new Map<string, (event: Event) => void>();
  const showNotification = vi.fn(async () => {});
  const matchAll = vi.fn<() => Promise<Array<{ url: string; focus: () => Promise<unknown> }>>>(async () => []);
  const openWindow = vi.fn(async () => {});
  runInNewContext(source, {
    URL,
    self: {
      location: { origin },
      registration: { showNotification },
      clients: { matchAll, openWindow },
      addEventListener: (name: string, listener: (event: Event) => void) => listeners.set(name, listener),
    },
  });

  async function dispatch(event: string, input: Omit<Event, 'waitUntil'>) {
    let work: Promise<unknown> | undefined;
    listeners.get(event)?.({ ...input, waitUntil: (operation) => { work = operation; } });
    await work;
  }

  return { showNotification, matchAll, openWindow, dispatch };
}

describe('Обработчики Web Push в service worker', () => {
  it('показывает уведомление и открывает тренировку при закрытом PWA', async () => {
    const worker = makeWorker();
    await worker.dispatch('push', { data: { json: () => ({ type: 'rest-ended', sessionId }) } });
    expect(worker.showNotification).toHaveBeenCalledWith('Отдых окончен', expect.objectContaining({
      data: { sessionId }, tag: 'rest-ended',
    }));

    const close = vi.fn();
    await worker.dispatch('notificationclick', { notification: { tag: 'rest-ended', data: { sessionId }, close } });
    expect(close).toHaveBeenCalledOnce();
    expect(worker.openWindow).toHaveBeenCalledWith(origin + '/sessions/' + sessionId);
  });

  it('использует своё окно и открывает новое, если переход не удался', async () => {
    const worker = makeWorker();
    const navigate = vi.fn(async () => null);
    worker.matchAll.mockResolvedValue([{ url: origin + '/workouts', focus: async () => ({ navigate }) }]);

    await worker.dispatch('notificationclick', {
      notification: { tag: 'rest-ended', data: { sessionId }, close: vi.fn() },
    });

    const target = origin + '/sessions/' + sessionId;
    expect(navigate).toHaveBeenCalledWith(target);
    expect(worker.openWindow).toHaveBeenCalledWith(target);
  });

  it('не переходит по постороннему URL из данных уведомления', async () => {
    const worker = makeWorker();
    await worker.dispatch('notificationclick', {
      notification: { tag: 'rest-ended', data: { sessionId: '//other.example' }, close: vi.fn() },
    });
    expect(worker.openWindow).toHaveBeenCalledWith(origin + '/');
  });
});
