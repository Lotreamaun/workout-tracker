import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiErrorBody, Workout, WorkoutListItem } from '@wt/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { setLogs, workoutExercises, workoutSessions } from '../../db/schema';

interface ExerciseDraft {
  id?: string;
  name: string;
  description?: string | null;
  plannedSets: number;
  plannedReps?: number | null;
  plannedWeight?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
}

function draft(name: string, overrides: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return { name, plannedSets: 3, ...overrides };
}

/** Ответ API содержит position, которого нет в ExerciseInput. */
function toDraft(exercise: Workout['exercises'][number]): ExerciseDraft {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    plannedSets: exercise.plannedSets,
    plannedReps: exercise.plannedReps,
    plannedWeight: exercise.plannedWeight,
    restSeconds: exercise.restSeconds,
    notes: exercise.notes,
  };
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('API /api/workouts', () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-workouts-'));
    app = buildApp({ dbPath: path.join(dir, 'test.db') });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function create(payload: Record<string, unknown>): Promise<Workout> {
    const res = await app.inject({ method: 'POST', url: '/api/workouts', payload });
    expect(res.statusCode).toBe(201);
    return res.json() as Workout;
  }

  async function get(id: string): Promise<Workout> {
    const res = await app.inject({ method: 'GET', url: `/api/workouts/${id}` });
    expect(res.statusCode).toBe(200);
    return res.json() as Workout;
  }

  async function list(): Promise<WorkoutListItem[]> {
    const res = await app.inject({ method: 'GET', url: '/api/workouts' });
    expect(res.statusCode).toBe(200);
    return res.json() as WorkoutListItem[];
  }

  async function patch(id: string, payload: Record<string, unknown>): Promise<Workout> {
    const res = await app.inject({ method: 'PATCH', url: `/api/workouts/${id}`, payload });
    expect(res.statusCode).toBe(200);
    return res.json() as Workout;
  }

  async function remove(id: string) {
    // DELETE намеренно без тела и content-type.
    return app.inject({ method: 'DELETE', url: `/api/workouts/${id}` });
  }

  function insertSession(workoutId: string, status: 'completed' | 'in_progress', completedAt: string | null): string {
    const id = crypto.randomUUID();
    app.db
      .insert(workoutSessions)
      .values({
        id,
        workoutId,
        workoutNameSnapshot: 'Снимок тренировки',
        status,
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt,
      })
      .run();
    return id;
  }

  function insertSetLog(sessionId: string, workoutExerciseId: string, exerciseNameSnapshot: string): string {
    const id = crypto.randomUUID();
    app.db
      .insert(setLogs)
      .values({
        id,
        sessionId,
        workoutExerciseId,
        exerciseNameSnapshot,
        exercisePosition: 0,
        setNumber: 1,
        plannedReps: 8,
        actualReps: 8,
        isCompleted: true,
      })
      .run();
    return id;
  }

  it('POST создаёт тренировку с упражнениями: поля ответа, позиции, без imagePath', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      payload: {
        name: 'Ноги',
        exercises: [{ name: 'Присед', plannedSets: 3, plannedReps: 8, plannedWeight: 80, restSeconds: 120 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const workout = res.json() as Workout;
    expect(workout).toMatchObject({
      name: 'Ноги',
      description: null,
      archivedAt: null,
      exercises: [
        { name: 'Присед', position: 0, plannedSets: 3, plannedReps: 8, plannedWeight: 80, restSeconds: 120 },
      ],
    });
    expect(workout.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(workout.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(workout.updatedAt).toBe(workout.createdAt);
    expect(workout.exercises[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(workout.exercises[0]).not.toHaveProperty('imagePath');
  });

  const invalidBodies: Array<[string, Record<string, unknown>]> = [
    ['пустое имя', { name: '' }],
    ['имя из пробелов', { name: '   ' }],
    ['имя длиннее 120 символов', { name: 'x'.repeat(121) }],
    ['plannedSets: 0', { name: 'Ноги', exercises: [draft('Присед', { plannedSets: 0 })] }],
    ['plannedSets: 1.5', { name: 'Ноги', exercises: [draft('Присед', { plannedSets: 1.5 })] }],
    ['plannedReps: 0', { name: 'Ноги', exercises: [draft('Присед', { plannedReps: 0 })] }],
    ['plannedWeight: -1', { name: 'Ноги', exercises: [draft('Присед', { plannedWeight: -1 })] }],
    ['restSeconds: 3601', { name: 'Ноги', exercises: [draft('Присед', { restSeconds: 3601 })] }],
    [
      '51 упражнение',
      { name: 'Ноги', exercises: Array.from({ length: 51 }, (_, index) => draft(`Упражнение ${index}`)) },
    ],
    ['неизвестное поле в теле', { name: 'Ноги', unknownField: true }],
    ['неизвестное поле в упражнении', { name: 'Ноги', exercises: [{ ...draft('Присед'), unknownField: true }] }],
  ];

  it.each(invalidBodies)('POST возвращает 400 VALIDATION_ERROR: %s', async (_caseName, payload) => {
    const res = await app.inject({ method: 'POST', url: '/api/workouts', payload });

    expect(res.statusCode).toBe(400);
    expect((res.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(await list()).toEqual([]);
  });

  it('POST при plannedSets: 0 указывает поле в error.details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      payload: { name: 'Ноги', exercises: [draft('Присед', { plannedSets: 0 })] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.details)).toContain('plannedSets');
  });

  it('GET сортирует тренировки по updatedAt по убыванию', async () => {
    const first = await create({ name: 'Первая' });
    await pause();
    const second = await create({ name: 'Вторая' });
    await pause();
    const updatedFirst = await patch(first.id, { name: 'Первая обновлённая' });

    expect(updatedFirst.updatedAt > first.updatedAt).toBe(true);
    const items = await list();
    expect(items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(items.map((item) => item.name)).toEqual(['Первая обновлённая', 'Вторая']);
  });

  it('GET считает упражнения и берёт lastPerformedAt только из completed-сессий', async () => {
    const empty = await create({ name: 'Без упражнений' });
    const withExercises = await create({ name: 'С упражнениями', exercises: [draft('A'), draft('B')] });
    const inProgressOnly = await create({ name: 'Только незавершённая сессия' });
    insertSession(inProgressOnly.id, 'in_progress', null);

    let items = await list();
    expect(items.find((item) => item.id === empty.id)).toMatchObject({ exerciseCount: 0, lastPerformedAt: null });
    expect(items.find((item) => item.id === withExercises.id)).toMatchObject({
      exerciseCount: 2,
      lastPerformedAt: null,
    });
    expect(items.find((item) => item.id === inProgressOnly.id)).toMatchObject({ lastPerformedAt: null });

    const completedAt = '2026-01-02T12:34:56.000Z';
    insertSession(withExercises.id, 'completed', completedAt);
    insertSession(withExercises.id, 'in_progress', null);

    items = await list();
    expect(items.find((item) => item.id === withExercises.id)).toMatchObject({ lastPerformedAt: completedAt });
    expect(items.find((item) => item.id === inProgressOnly.id)?.lastPerformedAt).toBeNull();
  });

  it('GET скрывает архивированные тренировки, но GET по id их возвращает', async () => {
    const active = await create({ name: 'Активная' });
    const archived = await create({ name: 'С историей' });
    insertSession(archived.id, 'completed', '2026-01-02T12:34:56.000Z');

    expect((await remove(archived.id)).json()).toEqual({ result: 'archived' });
    expect((await list()).map((item) => item.id)).toEqual([active.id]);

    const got = await get(archived.id);
    expect(got.name).toBe('С историей');
    expect(got.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('GET по id возвращает упражнения в порядке position', async () => {
    const created = await create({
      name: 'План',
      exercises: [draft('A'), draft('B'), draft('C')],
    });

    const got = await get(created.id);
    expect(got.exercises.map((exercise) => [exercise.name, exercise.position])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
    ]);
  });

  it('GET по неизвестному id возвращает 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/workouts/${crypto.randomUUID()}` });

    expect(res.statusCode).toBe(404);
    expect((res.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('PATCH меняет порядок упражнений, сохраняя их id', async () => {
    const created = await create({ name: 'План', exercises: [draft('A'), draft('B')] });
    const [a, b] = created.exercises.map(toDraft);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    const updated = await patch(created.id, { exercises: [b, a] });
    expect(updated.exercises.map((exercise) => exercise.id)).toEqual([b?.id, a?.id]);
    expect(updated.exercises.map((exercise) => exercise.position)).toEqual([0, 1]);
    expect((await get(created.id)).exercises.map((exercise) => [exercise.name, exercise.position])).toEqual([
      ['B', 0],
      ['A', 1],
    ]);
  });

  it('PATCH удаляет упражнение из плана, сохраняя подходы в истории', async () => {
    const created = await create({ name: 'План', exercises: [draft('Присед'), draft('Тяга')] });
    const [squat, pull] = created.exercises.map(toDraft);
    expect(squat).toBeDefined();
    expect(pull).toBeDefined();
    const sessionId = insertSession(created.id, 'completed', '2026-01-02T12:34:56.000Z');
    const setLogId = insertSetLog(sessionId, squat?.id ?? '', 'Присед');

    const updated = await patch(created.id, { exercises: [pull] });
    expect(updated.exercises.map((exercise) => exercise.name)).toEqual(['Тяга']);
    expect(app.db.select().from(workoutExercises).where(eq(workoutExercises.id, squat?.id ?? '')).all()).toEqual([]);

    const [log] = app.db.select().from(setLogs).where(eq(setLogs.id, setLogId)).all();
    expect(log).toMatchObject({ workoutExerciseId: null, exerciseNameSnapshot: 'Присед' });
  });

  it('PATCH создаёт упражнение без id', async () => {
    const created = await create({ name: 'План', exercises: [draft('A')] });
    const [original] = created.exercises.map(toDraft);

    const updated = await patch(created.id, { exercises: [original, draft('Новое')] });
    expect(updated.exercises).toHaveLength(2);
    expect(updated.exercises[0]?.id).toBe(original?.id);
    expect(updated.exercises[1]).toMatchObject({ name: 'Новое', position: 1, plannedSets: 3 });
    expect(updated.exercises[1]?.id).toBeTruthy();
    expect((await get(created.id)).exercises.map((exercise) => exercise.name)).toEqual(['A', 'Новое']);
  });

  it('PATCH с чужим id упражнения возвращает 400 и не меняет данные', async () => {
    const first = await create({ name: 'Первая', exercises: [draft('A')] });
    const second = await create({ name: 'Вторая', exercises: [draft('B')] });
    const foreign = second.exercises.map(toDraft)[0];
    const before = await get(first.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workouts/${first.id}`,
      payload: { exercises: [foreign] },
    });

    expect(res.statusCode).toBe(400);
    expect((res.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(await get(first.id)).toEqual(before);
    expect(await get(second.id)).toEqual(second);
  });

  it('PATCH обновляет updatedAt', async () => {
    const created = await create({ name: 'До' });
    await pause();

    const updated = await patch(created.id, { name: 'После' });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect((await list()).find((item) => item.id === created.id)?.updatedAt).toBe(updated.updatedAt);
  });

  it('PATCH архивированной тренировки возвращает 409 WORKOUT_ARCHIVED', async () => {
    const created = await create({ name: 'В архив' });
    insertSession(created.id, 'completed', '2026-01-02T12:34:56.000Z');
    expect((await remove(created.id)).json()).toEqual({ result: 'archived' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workouts/${created.id}`,
      payload: { name: 'Новое имя' },
    });

    expect(res.statusCode).toBe(409);
    expect((res.json() as ApiErrorBody).error.code).toBe('WORKOUT_ARCHIVED');
    expect((await get(created.id)).name).toBe('В архив');
  });

  it('DELETE без сессий физически удаляет тренировку и её упражнения', async () => {
    const created = await create({ name: 'Черновик', exercises: [draft('A'), draft('B')] });

    const res = await remove(created.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'deleted' });

    const missing = await app.inject({ method: 'GET', url: `/api/workouts/${created.id}` });
    expect(missing.statusCode).toBe(404);
    expect(app.db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, created.id)).all()).toEqual([]);
  });

  it('DELETE с завершённой сессией архивирует и сохраняет историю', async () => {
    const created = await create({ name: 'С историей', exercises: [draft('A')] });
    const exerciseId = created.exercises[0]?.id ?? '';
    const sessionId = insertSession(created.id, 'completed', '2026-01-02T12:34:56.000Z');
    const setLogId = insertSetLog(sessionId, exerciseId, 'A');

    const res = await remove(created.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'archived' });
    expect((await list()).find((item) => item.id === created.id)).toBeUndefined();
    expect((await get(created.id)).archivedAt).not.toBeNull();

    expect(app.db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId)).all()).toHaveLength(1);
    expect(app.db.select().from(setLogs).where(eq(setLogs.id, setLogId)).all()).toHaveLength(1);
    expect(app.db.select().from(workoutExercises).where(eq(workoutExercises.id, exerciseId)).all()).toHaveLength(1);
  });
});
