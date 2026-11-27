import path from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createDb, type Db } from './db/client';
import { registerAccess } from './plugins/access';
import { registerErrorHandlers } from './plugins/errors';
import { prepareMedia } from './modules/exercises/media';
import { exerciseRoutes } from './modules/exercises/routes';
import { backfillExercises } from './modules/exercises/service';
import { exchangeRoutes } from './modules/exchange/routes';
import { healthRoutes } from './modules/health/routes';
import { restPushRoutes } from './modules/rest-push/routes';
import type { VapidConfig } from './modules/rest-push/transport';
import { createWebPushTransport } from './modules/rest-push/transport';
import {
  REST_PUSH_DEFAULT_POLL_INTERVAL_MS,
  RestPushWorker,
  type RestPushTransport,
} from './modules/rest-push/worker';
import { sessionRoutes } from './modules/sessions/routes';
import { workoutRoutes } from './modules/workouts/routes';

declare module 'fastify' {
  interface FastifyInstance {
    /** Доступ к БД, в первую очередь для тестов (например, вставка сессий напрямую). */
    db: Db;
  }
}

export interface BuildAppOptions {
  dbPath: string;
  /** Каталог со сборкой фронтенда: если задан, api раздаёт статику и index.html для SPA-маршрутов. */
  webDist?: string;
  /** Общий ключ доступа к /api; без него защита выключена (dev, тесты). */
  apiToken?: string;
  /** Каталог медиа (files/ и tmp/); по умолчанию `media/` рядом с файлом БД. */
  mediaDir?: string;
  ffmpegPath?: string;
  /** Лимит размера загружаемого медиа в байтах (по умолчанию MEDIA_LIMITS.maxUploadBytes); нужен тестам. */
  mediaMaxUploadBytes?: number;
  corsOrigins?: string[];
  corsAllowPrivateNetwork?: boolean;
  /** VAPID-ключи Web Push; фича включается только вместе с apiToken. */
  vapid?: VapidConfig;
  /** Транспорт доставки Web Push (подставной в тестах); по умолчанию web-push. */
  restPushTransport?: RestPushTransport;
  /** Интервал цикла отправки в мс (тесты); по умолчанию 1 с. */
  restPushPollIntervalMs?: number;
  logger?: boolean;
}

const PRIVATE_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function buildApp({
  dbPath,
  webDist,
  apiToken,
  mediaDir = path.join(path.dirname(dbPath), 'media'),
  ffmpegPath = 'ffmpeg',
  mediaMaxUploadBytes,
  corsOrigins = [],
  corsAllowPrivateNetwork = false,
  vapid,
  restPushTransport,
  restPushPollIntervalMs,
  logger = false,
}: BuildAppOptions) {
  const app = Fastify({ logger });
  const { db, sqlite } = createDb(dbPath);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app, { spaFallback: Boolean(webDist) });
  backfillExercises(db);
  const media = prepareMedia(mediaDir, ffmpegPath, app.log);
  if (webDist) {
    app.register(fastifyStatic, { root: webDist });
  }
  // Файлы медиа неизменяемы (UUID в имени): долгий кэш; Range нужен видео в Safari.
  app.register(fastifyStatic, {
    root: media.filesDir,
    prefix: '/media/',
    decorateReply: false,
    immutable: true,
    maxAge: '365d',
  });

  app.register(cors, {
    origin: (origin, callback) => {
      const allowed =
        !origin || corsOrigins.includes(origin) || (corsAllowPrivateNetwork && PRIVATE_NETWORK_ORIGIN.test(origin));
      callback(null, allowed);
    },
    // @fastify/cors по умолчанию разрешает только GET/HEAD/POST — PATCH и DELETE нужны API явно.
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  });
  // Хук доступа должен идти после CORS: иначе 401 уходит без CORS-заголовков, и браузер видит «сеть недоступна».
  app.after(() => registerAccess(app, apiToken));

  app.decorate('db', db);

  app.register(healthRoutes(db), { prefix: '/api' });
  app.register(workoutRoutes(db), { prefix: '/api' });
  app.register(sessionRoutes(db), { prefix: '/api' });
  app.register(exchangeRoutes(db), { prefix: '/api' });
  app.register(exerciseRoutes(db, media, { maxUploadBytes: mediaMaxUploadBytes }), { prefix: '/api' });
  // Маршруты Web Push регистрируются всегда: без конфигурации config отдаёт publicKey: null, записи — 503.
  // CRUD подписки включается лишь при конфигурации VAPID и действующей защите API.
  const restPushVapid = apiToken && vapid ? vapid : undefined;
  const restPushEnabled = Boolean(restPushVapid);
  app.register(
    restPushRoutes(db, { enabled: restPushEnabled, publicKey: restPushVapid?.publicKey ?? null }),
    { prefix: '/api' },
  );
  const restPushWorker = restPushVapid
    ? new RestPushWorker(
        db,
        restPushTransport ?? createWebPushTransport(restPushVapid),
        restPushPollIntervalMs ?? REST_PUSH_DEFAULT_POLL_INTERVAL_MS,
        app.log,
      )
    : undefined;
  app.addHook('onReady', async () => {
    restPushWorker?.start();
  });

  app.addHook('onClose', async () => {
    // Цикл прекращает брать задачи и дожидается текущей отправки до закрытия SQLite.
    await restPushWorker?.stop();
    sqlite.close();
  });

  return app;
}
