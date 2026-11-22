import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiErrorBody } from '@wt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

type App = ReturnType<typeof buildApp>;

const TOKEN = 'test-access-key';
const withKey = { authorization: `Bearer ${TOKEN}` };

const workoutPayload = {
  name: 'Секретная тренировка',
  exercises: [{ name: 'Присед', plannedSets: 3 }],
};

describe('доступ к API по ключу', () => {
  let dir: string;
  let dbPath: string;
  let app: App;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-access-'));
    dbPath = path.join(dir, 'test.db');
    app = buildApp({ dbPath, apiToken: TOKEN });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/workouts без ключа возвращает 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workouts' });

    expect(res.statusCode).toBe(401);
    expect((res.json() as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/workouts с неверным ключом возвращает 401 и не создаёт тренировку', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: { authorization: 'Bearer wrong-key' },
      payload: workoutPayload,
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as ApiErrorBody).error.code).toBe('UNAUTHORIZED');

    const list = await app.inject({ method: 'GET', url: '/api/workouts', headers: withKey });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([]);
  });

  it('Authorization: Bearer <ключ> пропускает запрос', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: withKey,
      payload: workoutPayload,
    });
    expect(created.statusCode).toBe(201);

    const got = await app.inject({ method: 'GET', url: '/api/workouts', headers: withKey });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toHaveLength(1);
  });

  it('GET /api/health доступен без ключа', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('percent-encoded путь /%61pi/workouts без ключа не отдаёт данные', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/workouts', headers: withKey, payload: workoutPayload });
    expect(created.statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/%61pi/workouts' });

    expect([401, 404]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(200);
    expect(res.body).not.toContain('Секретная тренировка');
  });

  it('без apiToken запросы без заголовка Authorization работают', async () => {
    await app.close();
    app = buildApp({ dbPath });

    const created = await app.inject({ method: 'POST', url: '/api/workouts', payload: workoutPayload });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/workouts' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });

  it('ответ 401 имеет формат { error: { code, message } }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workouts' });

    expect(res.statusCode).toBe(401);
    const body = res.json() as ApiErrorBody;
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String) });
  });

  it('CORS: 401 для разрешённого origin содержит access-control-allow-origin', async () => {
    await app.close();
    app = buildApp({ dbPath, apiToken: TOKEN, corsOrigins: ['http://localhost:5173'] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/workouts',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
