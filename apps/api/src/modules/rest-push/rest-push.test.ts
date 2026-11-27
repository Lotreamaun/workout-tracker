import { createECDH, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Session, Workout } from '@wt/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import type { BuildAppOptions } from '../../app';
import { loadConfig } from '../../config';
import { restPushSubscriptions } from '../../db/schema';
import { findNextDueSubscription, tryCaptureTimer } from './repository';
import type { RestPushDelivery, RestPushTransport } from './worker';
import { REST_PUSH_JOB_TTL_SECONDS } from './worker';

const TOKEN = 'test-access-key';
const withKey = { authorization: `Bearer ${TOKEN}` };

// Стабильная пара VAPID-ключей (формат: base64url P-256, 65 и 32 байта).
const VAPID = {
  publicKey: 'BOfNBcqI3uNcbLlHozil4G4PY6VgZruNFT8g_x4WLNYGnoq4wNJ3mQF6-BC5G1QeBVhzPvhtSu3JU8Ip5tZPYHA',
  privateKey: 'RAtDXCTYoA__4O4n5Y8uytKnXZ6fEDRuRrqrxDj0F90',
  subject: 'mailto:tests@example.com',
};

const ENDPOINT = 'https://web.push.apple.com/1/AABBCC';
const KEYS = { p256dh: 'BExamplePublicKey', auth: 'authsecret' };

type App = ReturnType<typeof buildApp>;
type InjectResponse = Awaited<ReturnType<App['inject']>>;
type ErrorPayload = { error: { code: string; message: string; details?: unknown } };

function expectError(res: InjectResponse, statusCode: number, code: string) {
  expect(res.statusCode).toBe(statusCode);
  const body = res.json() as ErrorPayload;
  expect(body.error.code).toBe(code);
  expect(body.error.message).toBeTruthy();
  return body.error;
}

function createMockTransport(behavior: (delivery: RestPushDelivery) => Promise<void> = async () => {}) {
  const calls: RestPushDelivery[] = [];
  const transport: RestPushTransport = async (delivery) => {
    calls.push(delivery);
    await behavior(delivery);
  };
  return { calls, transport };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitFor: условие не наступило за ${timeoutMs} мс`);
    await sleep(5);
  }
}

function endsIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function startActiveSession(app: App): Promise<Session> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/workouts',
    headers: withKey,
    payload: { name: 'Силовая', exercises: [{ name: 'Присед', plannedSets: 1, restSeconds: 60 }] },
  });
  expect(created.statusCode).toBe(201);
  const workout = created.json() as Workout;
  const started = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions`, headers: withKey });
  expect(started.statusCode).toBe(201);
  return started.json() as Session;
}

async function subscribe(app: App, endpoint = ENDPOINT, keys = KEYS): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/rest-push/subscriptions',
    headers: withKey,
    payload: { endpoint, keys },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { id: string }).id;
}

function setTimer(
  app: App,
  subscriptionId: string,
  sessionId: string,
  endsAt: string | null,
  revision: number,
): Promise<InjectResponse> {
  return app.inject({
    method: 'PATCH',
    url: `/api/rest-push/subscriptions/${subscriptionId}/timer`,
    headers: withKey,
    payload: { sessionId, endsAt, revision },
  });
}

describe('rest-push: Web Push для отдыха', () => {
  let dir: string;
  let dbPath: string;
  const openedApps: App[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-rest-push-'));
    dbPath = path.join(dir, 'test.db');
  });

  afterEach(async () => {
    for (const app of openedApps) await app.close();
    openedApps.length = 0;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function newApp(options: Omit<Partial<BuildAppOptions>, 'dbPath'> = {}, transport?: RestPushTransport): App {
    const app = buildApp({
      dbPath,
      apiToken: TOKEN,
      vapid: VAPID,
      restPushPollIntervalMs: 10,
      ...(transport ? { restPushTransport: transport } : {}),
      ...options,
    });
    openedApps.push(app);
    return app;
  }

  function forget(app: App) {
    const index = openedApps.indexOf(app);
    if (index >= 0) openedApps.splice(index, 1);
  }

  function getSubscription(app: App, id: string) {
    return app.db.select().from(restPushSubscriptions).where(eq(restPushSubscriptions.id, id)).get();
  }

  describe('REST-контракт', () => {
    it('GET /api/rest-push/config отдаёт публичный ключ при включённой конфигурации', async () => {
      const app = newApp();

      const res = await app.inject({ method: 'GET', url: '/api/rest-push/config', headers: withKey });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ publicKey: VAPID.publicKey });
    });

    it('без VAPID: publicKey null, операции записи — 503 PUSH_DISABLED', async () => {
      const app = newApp({ vapid: undefined });

      const config = await app.inject({ method: 'GET', url: '/api/rest-push/config', headers: withKey });
      expect(config.statusCode).toBe(200);
      expect(config.json()).toEqual({ publicKey: null });

      expectError(
        await app.inject({
          method: 'POST',
          url: '/api/rest-push/subscriptions',
          headers: withKey,
          payload: { endpoint: ENDPOINT, keys: KEYS },
        }),
        503,
        'PUSH_DISABLED',
      );
      expectError(await setTimer(app, randomUUID(), randomUUID(), endsIn(60_000), 1), 503, 'PUSH_DISABLED');
      expectError(
        await app.inject({ method: 'DELETE', url: `/api/rest-push/subscriptions/${randomUUID()}`, headers: withKey }),
        503,
        'PUSH_DISABLED',
      );
    });

    it('VAPID без apiToken не включает фичу', async () => {
      const app = newApp({ apiToken: undefined });

      const config = await app.inject({ method: 'GET', url: '/api/rest-push/config' });
      expect(config.statusCode).toBe(200);
      expect(config.json()).toEqual({ publicKey: null });

      const post = await app.inject({
        method: 'POST',
        url: '/api/rest-push/subscriptions',
        payload: { endpoint: ENDPOINT, keys: KEYS },
      });
      expectError(post, 503, 'PUSH_DISABLED');
    });

    it('без ключа доступа маршруты Web Push дают 401 UNAUTHORIZED', async () => {
      const app = newApp();
      const id = randomUUID();

      expectError(await app.inject({ method: 'GET', url: '/api/rest-push/config' }), 401, 'UNAUTHORIZED');
      expectError(
        await app.inject({ method: 'POST', url: '/api/rest-push/subscriptions', payload: { endpoint: ENDPOINT, keys: KEYS } }),
        401,
        'UNAUTHORIZED',
      );
      expectError(
        await app.inject({ method: 'PATCH', url: `/api/rest-push/subscriptions/${id}/timer`, payload: {} }),
        401,
        'UNAUTHORIZED',
      );
      expectError(await app.inject({ method: 'DELETE', url: `/api/rest-push/subscriptions/${id}` }), 401, 'UNAUTHORIZED');
    });

    it('POST создаёт подписку; повторный POST того же endpoint возвращает прежний id и обновляет ключи', async () => {
      const app = newApp();

      const first = await subscribe(app, ENDPOINT, { p256dh: 'key-one', auth: 'auth-one' });
      const second = await subscribe(app, ENDPOINT, { p256dh: 'key-two', auth: 'auth-two' });

      expect(second).toBe(first);
      expect(getSubscription(app, first)).toMatchObject({
        endpoint: ENDPOINT,
        p256dh: 'key-two',
        auth: 'auth-two',
        lastRevision: 0,
        timerEndsAt: null,
      });

      const other = await subscribe(app, 'https://web.push.apple.com/1/OTHER');
      expect(other).not.toBe(first);
    });

    it('POST с адресом вне сервиса Apple Push отклоняется без исходящего запроса', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);

      const invalid = [
        'https://fcm.googleapis.com/fcm/send/abc',
        'http://web.push.apple.com/1/abc',
        'https://web.push.apple.com:8443/1/abc',
        'https://user:pass@web.push.apple.com/1/abc',
        'https://push.apple.com/1/abc',
        'not a url',
      ];
      for (const endpoint of invalid) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/rest-push/subscriptions',
          headers: withKey,
          payload: { endpoint, keys: KEYS },
        });
        expectError(res, 400, 'VALIDATION_ERROR');
      }

      expect(app.db.select().from(restPushSubscriptions).all()).toEqual([]);
      expect(calls).toEqual([]);
    });

    it('PATCH ставит срок активной сессии; повтор и запоздалая ревизия ничего не меняют', async () => {
      const app = newApp();
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);

      const ends = endsIn(120_000);
      const set = await setTimer(app, subscriptionId, session.id, ends, 5);
      expect(set.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)).toMatchObject({
        timerSessionId: session.id,
        timerEndsAt: ends,
        timerCapturedAt: null,
        lastRevision: 5,
      });

      const repeat = await setTimer(app, subscriptionId, session.id, ends, 5);
      expect(repeat.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)?.timerEndsAt).toBe(ends);

      const newer = endsIn(300_000);
      await setTimer(app, subscriptionId, session.id, newer, 7);
      const stale = await setTimer(app, subscriptionId, session.id, endsIn(60_000), 6);
      expect(stale.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)).toMatchObject({ timerEndsAt: newer, lastRevision: 7 });
    });

    it('отклоняет прошедший и далёкий срок, неизвестные сущности и закрытую сессию', async () => {
      const app = newApp();
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);

      expectError(await setTimer(app, subscriptionId, session.id, new Date(Date.now() - 1000).toISOString(), 1), 400, 'VALIDATION_ERROR');
      expectError(await setTimer(app, subscriptionId, session.id, endsIn(25 * 3_600_000), 1), 400, 'VALIDATION_ERROR');
      expectError(await setTimer(app, subscriptionId, session.id, endsIn(60_000), 0), 400, 'VALIDATION_ERROR');
      expectError(await setTimer(app, randomUUID(), session.id, endsIn(60_000), 1), 404, 'NOT_FOUND');
      expectError(await setTimer(app, subscriptionId, randomUUID(), endsIn(60_000), 1), 404, 'NOT_FOUND');
      expectError(
        await app.inject({
          method: 'PATCH',
          url: `/api/rest-push/subscriptions/${subscriptionId}/timer`,
          headers: withKey,
          payload: { sessionId: session.id, endsAt: endsIn(60_000), revision: 1, extra: 1 },
        }),
        400,
        'VALIDATION_ERROR',
      );

      const completed = await app.inject({ method: 'POST', url: `/api/sessions/${session.id}/complete`, headers: withKey });
      expect(completed.statusCode).toBe(200);
      expectError(await setTimer(app, subscriptionId, session.id, endsIn(60_000), 1), 409, 'SESSION_NOT_IN_PROGRESS');
      expect(getSubscription(app, subscriptionId)?.timerEndsAt).toBeNull();
    });

    it('отмена null применяется только к совпадающей сессии', async () => {
      const app = newApp();
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      const ends = endsIn(120_000);
      await setTimer(app, subscriptionId, session.id, ends, 3);

      const otherSession = await setTimer(app, subscriptionId, randomUUID(), null, 4);
      expect(otherSession.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)).toMatchObject({ timerEndsAt: ends, lastRevision: 4 });

      const cancel = await setTimer(app, subscriptionId, session.id, null, 5);
      expect(cancel.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)).toMatchObject({
        timerEndsAt: null,
        timerSessionId: null,
        lastRevision: 5,
      });
    });

    it('DELETE убирает подписку со сроком и повторно отвечает 204', async () => {
      const app = newApp();
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(120_000), 1);

      const del = await app.inject({ method: 'DELETE', url: `/api/rest-push/subscriptions/${subscriptionId}`, headers: withKey });
      expect(del.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)).toBeUndefined();

      const again = await app.inject({ method: 'DELETE', url: `/api/rest-push/subscriptions/${subscriptionId}`, headers: withKey });
      expect(again.statusCode).toBe(204);
    });
  });

  describe('цикл доставки', () => {
    it('отправляет уведомление по истечении срока и не повторяет уже отправленный', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      const ends = endsIn(60);

      const set = await setTimer(app, subscriptionId, session.id, ends, 1);
      expect(set.statusCode).toBe(204);

      await waitFor(() => calls.length === 1);
      const delivery = calls[0]!;
      expect(delivery).toMatchObject({ endpoint: ENDPOINT, keys: KEYS, urgency: 'high' });
      expect(JSON.parse(delivery.payload)).toEqual({ type: 'rest-ended', sessionId: session.id });
      // TTL отправки ограничен оставшимся временем жизни задачи
      expect(delivery.ttlSeconds).toBeGreaterThan(0);
      expect(delivery.ttlSeconds).toBeLessThanOrEqual(REST_PUSH_JOB_TTL_SECONDS + 1);

      expect(getSubscription(app, subscriptionId)).toMatchObject({ timerEndsAt: null, lastSentEndsAt: ends });

      await sleep(80);
      expect(calls).toHaveLength(1);

      // повторная установка уже отправленного срока не создаёт повторной отправки
      const repeat = await setTimer(app, subscriptionId, session.id, ends, 2);
      expect(repeat.statusCode).toBe(204);
      expect(getSubscription(app, subscriptionId)?.timerEndsAt).toBeNull();
      await sleep(120);
      expect(calls).toHaveLength(1);
    });

    it('продление до отправки отменяет прежний срок', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);

      await setTimer(app, subscriptionId, session.id, endsIn(80), 1);
      await setTimer(app, subscriptionId, session.id, endsIn(450), 2);

      await sleep(220); // прошёл первый срок
      expect(calls).toHaveLength(0);

      await waitFor(() => calls.length === 1);
      await sleep(100);
      expect(calls).toHaveLength(1);
    });

    it('пропуск (отмена) убирает запланированную отправку', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(80), 1);

      const cancel = await setTimer(app, subscriptionId, session.id, null, 2);
      expect(cancel.statusCode).toBe(204);

      await sleep(300);
      expect(calls).toHaveLength(0);
      expect(getSubscription(app, subscriptionId)).toMatchObject({ timerEndsAt: null, lastRevision: 2 });
    });

    it.each(['completed', 'abandoned'])('статус сессии %s отменяет будущую отправку', async (status) => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(300), 1);

      const url = `/api/sessions/${session.id}`;
      const closed = await app.inject(status === 'completed'
        ? { method: 'POST', url: `${url}/complete`, headers: withKey }
        : { method: 'PATCH', url, headers: withKey, payload: { status } });
      expect(closed.statusCode).toBe(200);

      await sleep(600);
      expect(calls).toHaveLength(0);
      expect(getSubscription(app, subscriptionId)?.timerEndsAt).toBeNull();
    });

    it('повтор запроса установки с той же ревизией не создаёт повторной отправки', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      const ends = endsIn(60);
      await setTimer(app, subscriptionId, session.id, ends, 9);
      await setTimer(app, subscriptionId, session.id, ends, 9);

      await waitFor(() => calls.length === 1);
      await sleep(100);
      expect(calls).toHaveLength(1);
    });

    it('перезапуск сервера сохраняет ожидающую отправку и ревизию', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(700), 1);
      await app.close();
      forget(app);

      const restarted = newApp({}, transport);
      await restarted.ready();
      await waitFor(() => getSubscription(restarted, subscriptionId)?.timerEndsAt === null);

      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.payload)).toEqual({ type: 'rest-ended', sessionId: session.id });
      expect(getSubscription(restarted, subscriptionId)).toMatchObject({ timerEndsAt: null, lastRevision: 1 });
    });

    it('задача старше 30 секунд от срока не отправляется', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);

      // Просроченный срок вставляем напрямую: API такой срок не принимает.
      app.db
        .update(restPushSubscriptions)
        .set({
          timerSessionId: session.id,
          timerEndsAt: new Date(Date.now() - 40_000).toISOString(),
          timerCapturedAt: null,
        })
        .where(eq(restPushSubscriptions.id, subscriptionId))
        .run();

      await sleep(60);
      expect(calls).toHaveLength(0);
      expect(getSubscription(app, subscriptionId)?.timerEndsAt).toBeNull();
    });

    it('захват пропускает срок, заменённый после чтения', async () => {
      const app = newApp({ restPushPollIntervalMs: 60_000 });
      const session = await startActiveSession(app);
      const id = await subscribe(app);
      expect((await setTimer(app, id, session.id, endsIn(60_000), 1)).statusCode).toBe(204);
      app.db.update(restPushSubscriptions).set({ timerEndsAt: endsIn(-1) }).where(eq(restPushSubscriptions.id, id)).run();
      const now = endsIn(0);
      const due = findNextDueSubscription(app.db, now);
      expect(due?.id).toBe(id);

      const extended = endsIn(120_000);
      expect((await setTimer(app, id, session.id, extended, 2)).statusCode).toBe(204);
      expect(tryCaptureTimer(app.db, due!, now, endsIn(-30_000))).toBeNull();
      expect(getSubscription(app, id)).toMatchObject({ timerEndsAt: extended, timerCapturedAt: null });
    });

    it.each([404, 410])('ответ %s сервиса удаляет подписку', async (statusCode) => {
      const { calls, transport } = createMockTransport(async () => {
        throw Object.assign(new Error('gone'), { statusCode });
      });
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(40), 1);

      await waitFor(() => calls.length === 1);
      await sleep(30);
      expect(getSubscription(app, subscriptionId)).toBeUndefined();
    });

    it('ответ по старым ключам не удаляет уже обновлённую подписку', async () => {
      let finishSend!: () => void;
      const sending = new Promise<void>((resolve) => { finishSend = resolve; });
      const { calls, transport } = createMockTransport(async () => {
        await sending;
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      });
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const id = await subscribe(app);
      const newKeys = { p256dh: 'different-key', auth: 'different-secret' };

      try {
        expect((await setTimer(app, id, session.id, endsIn(40), 1)).statusCode).toBe(204);
        await waitFor(() => calls.length === 1);
        expect(await subscribe(app, ENDPOINT, newKeys)).toBe(id);
      } finally {
        finishSend();
      }
      await waitFor(() => getSubscription(app, id)?.timerCapturedAt == null);
      expect(getSubscription(app, id)).toMatchObject(newKeys);
    });

    it('сетевой сбой теряет одну отправку, но сохраняет подписку и позволяет доставку снова', async () => {
      const { calls, transport } = createMockTransport(async () => {
        throw new Error('network down');
      });
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(40), 1);

      await waitFor(() => calls.length === 1);
      await sleep(40);
      const row = getSubscription(app, subscriptionId);
      expect(row).toMatchObject({ timerEndsAt: null, timerCapturedAt: null });
      expect(row?.lastSentEndsAt).toBeNull();

      const setAgain = await setTimer(app, subscriptionId, session.id, endsIn(60), 2);
      expect(setAgain.statusCode).toBe(204);
      await waitFor(() => calls.length === 2);
    });

    it('при закрытии цикл дожидается текущей отправки', async () => {
      const { calls, transport } = createMockTransport(async () => {
        await sleep(150);
      });
      const app = newApp({}, transport);
      const session = await startActiveSession(app);
      const subscriptionId = await subscribe(app);
      await setTimer(app, subscriptionId, session.id, endsIn(20), 1);
      await waitFor(() => calls.length === 1); // отправка уже выполняется

      const startedAt = Date.now();
      await app.close();
      forget(app);

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
    });

    it('без конфигурации цикл доставки не запускается', async () => {
      const { calls, transport } = createMockTransport();
      const app = newApp({ vapid: undefined }, transport);
      const now = new Date().toISOString();

      app.db
        .insert(restPushSubscriptions)
        .values({
          id: randomUUID(),
          endpoint: ENDPOINT,
          p256dh: KEYS.p256dh,
          auth: KEYS.auth,
          timerSessionId: randomUUID(),
          timerEndsAt: endsIn(20),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      await sleep(150);
      expect(calls).toHaveLength(0);
    });
  });

  describe('конфигурация VAPID в окружении', () => {
    it('без VAPID фича остаётся выключенной', () => {
      expect(loadConfig({}).vapid).toBeUndefined();
      expect(loadConfig({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: ' ', VAPID_SUBJECT: '' }).vapid).toBeUndefined();
    });

    it('отклоняет непарные ключи', () => {
      const otherPair = createECDH('prime256v1');
      otherPair.generateKeys();
      expect(() => loadConfig({
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: otherPair.getPrivateKey('base64url'),
        VAPID_SUBJECT: VAPID.subject,
      })).toThrow(/должны составлять одну пару/);
    });

    it.each(['https://', 'https://localhost', 'mailto:', 'mailto:tester@localhost'])(
      'отклоняет недействующий контакт %s',
      (contact) => {
        expect(() => loadConfig({
          VAPID_PUBLIC_KEY: VAPID.publicKey,
          VAPID_PRIVATE_KEY: VAPID.privateKey,
          VAPID_SUBJECT: contact,
        })).toThrow(/VAPID_SUBJECT/);
      },
    );

    it('полная тройка значений собирается в конфигурацию', () => {
      const config = loadConfig({
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
        VAPID_SUBJECT: VAPID.subject,
      });
      expect(config.vapid).toEqual(VAPID);
    });

    it('неполная тройка и некорректные значения отклоняются', () => {
      expect(() => loadConfig({ VAPID_PUBLIC_KEY: VAPID.publicKey })).toThrow(/VAPID/);
      expect(() =>
        loadConfig({
          VAPID_PUBLIC_KEY: 'short',
          VAPID_PRIVATE_KEY: VAPID.privateKey,
          VAPID_SUBJECT: VAPID.subject,
        }),
      ).toThrow(/VAPID_PUBLIC_KEY/);
      expect(() =>
        loadConfig({
          VAPID_PUBLIC_KEY: VAPID.publicKey,
          VAPID_PRIVATE_KEY: 'short',
          VAPID_SUBJECT: VAPID.subject,
        }),
      ).toThrow(/VAPID_PRIVATE_KEY/);
      expect(() =>
        loadConfig({
          VAPID_PUBLIC_KEY: VAPID.publicKey,
          VAPID_PRIVATE_KEY: VAPID.privateKey,
          VAPID_SUBJECT: 'user@example.com',
        }),
      ).toThrow(/VAPID_SUBJECT/);
    });
  });
});
