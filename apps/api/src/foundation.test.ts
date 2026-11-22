import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiErrorSchema } from '@wt/shared';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { BuildAppOptions } from './app';
import { workouts } from './db/schema';

const EXPECTED_TABLES = ['workouts', 'workout_exercises', 'workout_sessions', 'set_logs'];

type App = ReturnType<typeof buildApp>;

function parseErrorBody(body: unknown) {
  const parsed = apiErrorSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    throw new Error('Ответ не соответствует формату ошибки API');
  }
  return parsed.data.error;
}

function registerValidationRoute(app: App) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/test-validate',
    { schema: { body: z.object({ n: z.number() }) } },
    async () => ({ ok: true }),
  );
}

describe('foundation: каркас API', () => {
  let dir: string;
  let dbPath: string;
  const openedApps = new Set<App>();

  function newApp(options: Omit<BuildAppOptions, 'dbPath'> & { dbPath?: string } = {}): App {
    const app = buildApp({ dbPath, ...options });
    openedApps.add(app);
    return app;
  }

  async function closeApp(app: App) {
    await app.close();
    openedApps.delete(app);
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-foundation-'));
    dbPath = path.join(dir, 'test.db');
  });

  afterEach(async () => {
    for (const app of openedApps) {
      await app.close();
    }
    openedApps.clear();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/health возвращает 200, status "ok" и время в ISO 8601 UTC', async () => {
    const res = await newApp().inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ status?: unknown; time?: unknown }>();
    expect(body.status).toBe('ok');
    expect(typeof body.time).toBe('string');
    expect((body.time as string).endsWith('Z')).toBe(true);
    expect(Number.isNaN(Date.parse(body.time as string))).toBe(false);
  });

  it('неизвестный маршрут возвращает 404 и ошибку NOT_FOUND', async () => {
    const res = await newApp().inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(res.statusCode).toBe(404);
    const error = parseErrorBody(res.json());
    expect(error.code).toBe('NOT_FOUND');
    expect(typeof error.message).toBe('string');
  });

  it('тело, не проходящее Zod-схему, отклоняется с VALIDATION_ERROR и details', async () => {
    const app = newApp();
    registerValidationRoute(app);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/test-validate', payload: { n: 'x' } });

    expect(res.statusCode).toBe(400);
    const error = parseErrorBody(res.json());
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(error.details)).toBe(true);
    expect((error.details as unknown[]).length).toBeGreaterThan(0);
  });

  it('невалидный JSON в теле возвращает 400 в формате ошибки API', async () => {
    const app = newApp();
    registerValidationRoute(app);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/test-validate',
      headers: { 'content-type': 'application/json' },
      payload: '{"n":',
    });

    expect(res.statusCode).toBe(400);
    const error = parseErrorBody(res.json());
    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
  });

  it('непредвиденное исключение возвращает 500 INTERNAL_ERROR без утечки деталей', async () => {
    const app = newApp();
    app.withTypeProvider<ZodTypeProvider>().get('/api/test-throw', async () => {
      throw new Error('boom');
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/test-throw' });

    expect(res.statusCode).toBe(500);
    const error = parseErrorBody(res.json());
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('boom');
    expect(res.body).not.toContain('stack');
  });

  it('данные сохраняются после закрытия и повторного buildApp с тем же файлом', async () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const first = newApp();
    first.db.insert(workouts).values({ id, name: 'Силовая', createdAt: now, updatedAt: now }).run();
    await closeApp(first);

    const restarted = newApp();
    const rows = restarted.db.select().from(workouts).where(eq(workouts.id, id)).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, name: 'Силовая', createdAt: now });
  });

  it('отсутствующий файл БД создаётся, миграции применяются автоматически', async () => {
    expect(fs.existsSync(dbPath)).toBe(false);

    const app = newApp();

    expect(fs.existsSync(dbPath)).toBe(true);
    const tables = app.db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it('CORS разрешает только указанные origin', async () => {
    const app = newApp({ corsOrigins: ['http://allowed.test'] });

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://allowed.test' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://allowed.test');

    const denied = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://evil.test' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('при заданном webDist раздаёт фронтенд, SPA-маршруты и оставляет 404 для /api', async () => {
    const webDist = path.join(dir, 'web');
    fs.mkdirSync(webDist);
    fs.writeFileSync(path.join(webDist, 'index.html'), '<html>spa</html>');
    const app = newApp({ webDist });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('spa');

    const route = await app.inject({ method: 'GET', url: '/history' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('spa');

    const missingApi = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(missingApi.statusCode).toBe(404);
    expect(parseErrorBody(missingApi.json()).code).toBe('NOT_FOUND');
  });

  it.each(['PATCH', 'DELETE'])('CORS preflight разрешает метод %s', async (method) => {
    const app = newApp({ corsOrigins: ['http://allowed.test'] });

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/sessions/any',
      headers: {
        origin: 'http://allowed.test',
        'access-control-request-method': method,
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['access-control-allow-methods']).split(/,\s*/)).toContain(method);
  });
});
