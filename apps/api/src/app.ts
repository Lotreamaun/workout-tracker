import cors from '@fastify/cors';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createDb, type Db } from './db/client';
import { registerErrorHandlers } from './plugins/errors';
import { exchangeRoutes } from './modules/exchange/routes';
import { healthRoutes } from './modules/health/routes';
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
  corsOrigins?: string[];
  corsAllowPrivateNetwork?: boolean;
  logger?: boolean;
}

const PRIVATE_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function buildApp({
  dbPath,
  corsOrigins = [],
  corsAllowPrivateNetwork = false,
  logger = false,
}: BuildAppOptions) {
  const app = Fastify({ logger });
  const { db, sqlite } = createDb(dbPath);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);

  app.register(cors, {
    origin: (origin, callback) => {
      const allowed =
        !origin || corsOrigins.includes(origin) || (corsAllowPrivateNetwork && PRIVATE_NETWORK_ORIGIN.test(origin));
      callback(null, allowed);
    },
    // @fastify/cors по умолчанию разрешает только GET/HEAD/POST — PATCH и DELETE нужны API явно.
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  });

  app.decorate('db', db);

  app.register(healthRoutes(db), { prefix: '/api' });
  app.register(workoutRoutes(db), { prefix: '/api' });
  app.register(sessionRoutes(db), { prefix: '/api' });
  app.register(exchangeRoutes(db), { prefix: '/api' });

  app.addHook('onClose', async () => {
    sqlite.close();
  });

  return app;
}
