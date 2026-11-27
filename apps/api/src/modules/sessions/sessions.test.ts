import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Session, SessionListItem, Workout, WorkoutListItem } from '@wt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { workoutSessions } from '../../db/schema';

type App = ReturnType<typeof buildApp>;
type InjectResponse = Awaited<ReturnType<App['inject']>>;
type ErrorPayload = { error: { code: string; message: string; details?: unknown } };

function templateInput(): Record<string, unknown> {
  return {
    name: 'Силовая тренировка',
    exercises: [
      { name: 'Присед', plannedSets: 3, plannedReps: 8, plannedWeight: 80, restSeconds: 120 },
      { name: 'Жим', plannedSets: 2, plannedReps: 10, plannedWeight: 40, restSeconds: 90 },
    ],
  };
}

function expectError(res: InjectResponse, statusCode: number, code: string): ErrorPayload['error'] {
  expect(res.statusCode).toBe(statusCode);
  const body = res.json() as ErrorPayload;
  expect(body.error.code).toBe(code);
  expect(body.error.message).toBeTruthy();
  return body.error;
}

async function createWorkout(app: App, input: Record<string, unknown> = templateInput()): Promise<Workout> {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', payload: input });
  expect(res.statusCode).toBe(201);
  return res.json() as Workout;
}

async function getWorkout(app: App, id: string): Promise<Workout> {
  const res = await app.inject({ method: 'GET', url: `/api/workouts/${id}` });
  expect(res.statusCode).toBe(200);
  return res.json() as Workout;
}

async function getWorkouts(app: App): Promise<WorkoutListItem[]> {
  const res = await app.inject({ method: 'GET', url: '/api/workouts' });
  expect(res.statusCode).toBe(200);
  return res.json() as WorkoutListItem[];
}

async function startSession(app: App, workoutId: string): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: `/api/workouts/${workoutId}/sessions` });
  expect(res.statusCode).toBe(201);
  return res.json() as Session;
}

async function getSession(app: App, id: string): Promise<Session> {
  const res = await app.inject({ method: 'GET', url: `/api/sessions/${id}` });
  expect(res.statusCode).toBe(200);
  return res.json() as Session;
}

async function listSessions(app: App, query = ''): Promise<SessionListItem[]> {
  const res = await app.inject({ method: 'GET', url: `/api/sessions${query}` });
  expect(res.statusCode).toBe(200);
  return res.json() as SessionListItem[];
}

async function patchSession(app: App, id: string, payload: Record<string, unknown>): Promise<InjectResponse> {
  return app.inject({ method: 'PATCH', url: `/api/sessions/${id}`, payload });
}

async function completeSession(app: App, id: string, payload?: Record<string, unknown>): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: `/api/sessions/${id}/complete`, payload });
  expect(res.statusCode).toBe(200);
  return res.json() as Session;
}

describe('сессии тренировок (API)', () => {
  let dir: string;
  let app: App;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-sessions-'));
    app = buildApp({ dbPath: path.join(dir, 'test.db') });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('POST /api/workouts/:id/sessions', () => {
    it('создаёт in_progress-сессию со snapshot плана и подходами с номера 1', async () => {
      const workout = await createWorkout(app);
      const templateBefore = await getWorkout(app, workout.id);

      const session = await startSession(app, workout.id);

      expect(session).toMatchObject({
        workoutId: workout.id,
        workoutNameSnapshot: 'Силовая тренировка',
        status: 'in_progress',
        notes: null,
        completedAt: null,
      });
      expect(session.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(session.exercises.map((exercise) => exercise.exercisePosition)).toEqual([0, 1]);
      expect(session.exercises.map((exercise) => exercise.name)).toEqual(['Присед', 'Жим']);
      expect(session.exercises.map((exercise) => exercise.restSeconds)).toEqual([120, 90]);
      expect(session.exercises.map((exercise) => exercise.sets.length)).toEqual([3, 2]);
      expect(session.exercises[0]?.sets.map((set) => set.setNumber)).toEqual([1, 2, 3]);
      expect(session.exercises[1]?.sets.map((set) => set.setNumber)).toEqual([1, 2]);

      const squats = session.exercises[0]!.sets;
      expect(squats.every((set) => set.plannedReps === 8 && set.plannedWeight === 80)).toBe(true);
      const presses = session.exercises[1]!.sets;
      expect(presses.every((set) => set.plannedReps === 10 && set.plannedWeight === 40)).toBe(true);
      for (const set of [...squats, ...presses]) {
        expect(set).toMatchObject({
          actualReps: null,
          actualWeight: null,
          rpe: null,
          isCompleted: false,
          completedAt: null,
          notes: null,
        });
      }
      const allSets = [...squats, ...presses];
      expect(new Set(allSets.map((set) => set.id)).size).toBe(allSets.length);
      expect(await getWorkout(app, workout.id)).toEqual(templateBefore);
    });

    it('сохраняет описание в снимке сессии после правки шаблона', async () => {
      const exercise = { name: 'Жим', description: 'Техника на момент старта', plannedSets: 2 };
      const workout = await createWorkout(app, { name: 'Снимок описания', exercises: [exercise] });
      const session = await startSession(app, workout.id);
      expect(session.exercises[0]?.description).toBe(exercise.description);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workouts/${workout.id}`,
        payload: { exercises: [{ ...exercise, id: workout.exercises[0]!.id, description: 'Новая техника' }] },
      });
      expect(res.statusCode).toBe(200);
      expect((await getSession(app, session.id)).exercises[0]?.description).toBe(exercise.description);
    });

    it('не создаёт вторую сессию при активной: 409 SESSION_IN_PROGRESS с её id', async () => {
      const workout = await createWorkout(app);
      const another = await createWorkout(app, { name: 'Другая', exercises: [{ name: 'Тяга', plannedSets: 2 }] });
      const active = await startSession(app, workout.id);

      for (const id of [workout.id, another.id]) {
        const res = await app.inject({ method: 'POST', url: `/api/workouts/${id}/sessions` });
        expect(expectError(res, 409, 'SESSION_IN_PROGRESS').details).toEqual({ sessionId: active.id });
      }
      expect((await listSessions(app, '?status=in_progress')).map((item) => item.id)).toEqual([active.id]);
    });

    it('не запускает архивированный шаблон: 409 WORKOUT_ARCHIVED', async () => {
      const workout = await createWorkout(app);
      await completeSession(app, (await startSession(app, workout.id)).id);
      const deleted = await app.inject({ method: 'DELETE', url: `/api/workouts/${workout.id}` });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ result: 'archived' });

      const res = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions` });
      expectError(res, 409, 'WORKOUT_ARCHIVED');
    });

    it('не запускает шаблон без упражнений: 409 WORKOUT_EMPTY', async () => {
      const workout = await createWorkout(app, { name: 'Пустая', exercises: [] });
      const res = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions` });
      expectError(res, 409, 'WORKOUT_EMPTY');
    });

    it('возвращает 404 для неизвестной тренировки', async () => {
      const res = await app.inject({ method: 'POST', url: `/api/workouts/${randomUUID()}/sessions` });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('возвращает 404 для неизвестной сессии', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/sessions/${randomUUID()}` });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('отметка и снятие отметки управляют completedAt и сохраняют факт, не меняя шаблон', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);
      const templateBefore = await getWorkout(app, workout.id);
      const setId = session.exercises[0]!.sets[0]!.id;

      const marked = await patchSession(app, session.id, {
        sets: [{ id: setId, actualReps: 8, actualWeight: 82.5, rpe: 8.5, isCompleted: true, notes: 'было тяжело' }],
      });
      expect(marked.statusCode).toBe(200);
      const markedSet = (marked.json() as Session).exercises[0]!.sets[0]!;
      expect(markedSet).toMatchObject({
        id: setId,
        actualReps: 8,
        actualWeight: 82.5,
        rpe: 8.5,
        isCompleted: true,
        notes: 'было тяжело',
      });
      expect(markedSet.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(await getWorkout(app, workout.id)).toEqual(templateBefore);

      const unmarked = await patchSession(app, session.id, { sets: [{ id: setId, isCompleted: false }] });
      expect(unmarked.statusCode).toBe(200);
      const unmarkedSet = (unmarked.json() as Session).exercises[0]!.sets[0]!;
      expect(unmarkedSet.completedAt).toBeNull();
      expect(unmarkedSet.isCompleted).toBe(false);
      expect(unmarkedSet).toMatchObject({ actualReps: 8, actualWeight: 82.5, rpe: 8.5, notes: 'было тяжело' });
      expect(await getWorkout(app, workout.id)).toEqual(templateBefore);
    });

    it('пропускает упражнение по позиции 1 для всех его подходов', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);

      const skipped = await patchSession(app, session.id, {
        exercises: [{ exercisePosition: 1, isSkipped: true }],
      });
      expect(skipped.statusCode).toBe(200);
      const exercises = (skipped.json() as Session).exercises;
      expect(exercises.map((exercise) => exercise.isSkipped)).toEqual([false, true]);
      expect(exercises[1]?.sets).toHaveLength(2);

      const unskipped = await patchSession(app, session.id, {
        exercises: [{ exercisePosition: 1, isSkipped: false }],
      });
      expect((unskipped.json() as Session).exercises.map((exercise) => exercise.isSkipped)).toEqual([false, false]);
    });

    it('принимает rpe 7.5 и отклоняет 11 и 7.3 как VALIDATION_ERROR', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);
      const setId = session.exercises[0]!.sets[0]!.id;

      for (const rpe of [11, 7.3]) {
        const res = await patchSession(app, session.id, { sets: [{ id: setId, rpe }] });
        expectError(res, 400, 'VALIDATION_ERROR');
      }
      expect((await getSession(app, session.id)).exercises[0]!.sets[0]!.rpe).toBeNull();

      const valid = await patchSession(app, session.id, { sets: [{ id: setId, rpe: 7.5 }] });
      expect(valid.statusCode).toBe(200);
      expect((valid.json() as Session).exercises[0]!.sets[0]!.rpe).toBe(7.5);
    });

    it('отклоняет id подхода чужой сессии: 400 VALIDATION_ERROR', async () => {
      const workout = await createWorkout(app);
      const first = await startSession(app, workout.id);
      const aborted = await patchSession(app, first.id, { status: 'abandoned' });
      expect(aborted.statusCode).toBe(200);

      const second = await startSession(app, workout.id);
      const res = await patchSession(app, second.id, { sets: [{ id: first.exercises[0]!.sets[0]!.id, actualReps: 5 }] });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect((await getSession(app, second.id)).exercises[0]!.sets[0]!.actualReps).toBeNull();
    });

    it('после abandoned можно стартовать новую сессию, но старую нельзя редактировать', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);

      const aborted = await patchSession(app, session.id, { status: 'abandoned' });
      expect(aborted.statusCode).toBe(200);
      expect((aborted.json() as Session).status).toBe('abandoned');
      expect((await startSession(app, workout.id)).id).not.toBe(session.id);

      const res = await patchSession(app, session.id, { notes: 'поздно' });
      expectError(res, 409, 'SESSION_NOT_EDITABLE');
      const complete = await app.inject({ method: 'POST', url: `/api/sessions/${session.id}/complete` });
      expectError(complete, 409, 'SESSION_NOT_IN_PROGRESS');
    });

    it('позволяет исправлять завершённую сессию', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);
      await completeSession(app, session.id);

      const setId = session.exercises[0]!.sets[0]!.id;
      const res = await patchSession(app, session.id, { sets: [{ id: setId, actualReps: 9, isCompleted: true }] });
      expect(res.statusCode).toBe(200);
      const updated = res.json() as Session;
      expect(updated.status).toBe('completed');
      expect(updated.exercises[0]!.sets[0]).toMatchObject({ actualReps: 9, isCompleted: true });
      expect(updated.exercises[0]!.sets[0]!.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('возвращает 404 для неизвестной сессии', async () => {
      const res = await patchSession(app, randomUUID(), { notes: 'тест' });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('POST /api/sessions/:id/complete', () => {
    it('завершает сессию, запрещает повтор и обновляет lastPerformedAt шаблона', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);

      const completed = await completeSession(app, session.id, { notes: 'хорошая тренировка' });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(completed.notes).toBe('хорошая тренировка');
      expect(completed.exercises).toEqual(session.exercises);

      const repeated = await app.inject({ method: 'POST', url: `/api/sessions/${session.id}/complete` });
      expectError(repeated, 409, 'SESSION_NOT_IN_PROGRESS');

      const workouts = await getWorkouts(app);
      expect(workouts.find((item) => item.id === workout.id)?.lastPerformedAt).toBe(completed.completedAt);
      expect((await listSessions(app))[0]).toMatchObject({
        id: session.id,
        completedSets: 0,
        totalSets: 5,
      });
    });

    it('возвращает 404 для неизвестной сессии', async () => {
      const res = await app.inject({ method: 'POST', url: `/api/sessions/${randomUUID()}/complete`, payload: {} });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('GET /api/sessions', () => {
    it('по умолчанию отдаёт только завершённые, фильтрует по status и проверяет limit', async () => {
      const workout = await createWorkout(app);
      const completed = await startSession(app, workout.id);
      await completeSession(app, completed.id);
      const abandoned = await startSession(app, workout.id);
      await patchSession(app, abandoned.id, { status: 'abandoned' });
      const active = await startSession(app, workout.id);

      expect((await listSessions(app)).map((item) => item.id)).toEqual([completed.id]);
      expect((await listSessions(app, '?status=completed')).map((item) => item.id)).toEqual([completed.id]);
      expect((await listSessions(app, '?status=abandoned')).map((item) => item.id)).toEqual([abandoned.id]);
      expect((await listSessions(app, '?status=in_progress')).map((item) => item.id)).toEqual([active.id]);
      expect(await listSessions(app, '?limit=1')).toHaveLength(1);

      for (const limit of [0, 101]) {
        const res = await app.inject({ method: 'GET', url: `/api/sessions?limit=${limit}` });
        expectError(res, 400, 'VALIDATION_ERROR');
      }
    });

    it('сортирует по startedAt по убыванию и считает completedSets/totalSets', async () => {
      const workout = await createWorkout(app);
      const ids: string[] = [];
      const starts = ['2026-01-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z'];

      for (const [index, startedAt] of starts.entries()) {
        const session = await startSession(app, workout.id);
        const sets = session.exercises[0]!.sets.slice(0, index + 1);
        const patch = await patchSession(app, session.id, {
          sets: sets.map((set) => ({ id: set.id, isCompleted: true })),
        });
        expect(patch.statusCode).toBe(200);
        await completeSession(app, session.id);
        app.db.update(workoutSessions).set({ startedAt }).where(eq(workoutSessions.id, session.id)).run();
        ids.push(session.id);
      }

      const items = await listSessions(app);
      expect(items.map((item) => item.id)).toEqual([...ids].reverse());
      expect(items.map((item) => [item.completedSets, item.totalSets])).toEqual([
        [3, 5],
        [2, 5],
        [1, 5],
      ]);
      expect((await listSessions(app, '?limit=1')).map((item) => item.id)).toEqual([ids[2]]);
    });
  });

  describe('session-history: независимость от шаблона', () => {
    it('переименование, правка плана и удаление упражнения не меняют детали сессии', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);
      const removedSet = session.exercises[1]!.sets[0]!;
      const patch = await patchSession(app, session.id, {
        sets: [{ id: removedSet.id, actualReps: 12, rpe: 7.5, isCompleted: true }],
      });
      expect(patch.statusCode).toBe(200);
      await completeSession(app, session.id);
      const before = await getSession(app, session.id);

      const template = await getWorkout(app, workout.id);
      const kept = template.exercises[0]!;
      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/workouts/${workout.id}`,
        payload: {
          name: 'Новое имя шаблона',
          exercises: [
            {
              id: kept.id,
              name: 'Присед (новый)',
              description: kept.description,
              plannedSets: kept.plannedSets,
              plannedReps: kept.plannedReps,
              plannedWeight: 999,
              restSeconds: kept.restSeconds,
              notes: kept.notes,
            },
          ],
        },
      });
      expect(updated.statusCode).toBe(200);
      const templateAfter = updated.json() as Workout;
      expect(templateAfter.name).toBe('Новое имя шаблона');
      expect(templateAfter.exercises).toHaveLength(1);
      expect(templateAfter.exercises[0]?.plannedWeight).toBe(999);

      const after = await getSession(app, session.id);
      // workoutExerciseId обнуляется внешним ключом при удалении упражнения шаблона
      // (это прямо описано в sessionExerciseSchema); snapshot-поля остаются прежними.
      const expected = {
        ...before,
        exercises: before.exercises.map((exercise) =>
          exercise.exercisePosition === 1 ? { ...exercise, workoutExerciseId: null } : exercise,
        ),
      };
      expect(after).toEqual(expected);
      expect(after.workoutNameSnapshot).toBe(before.workoutNameSnapshot);
      expect(after.exercises.map((exercise) => exercise.name)).toEqual(['Присед', 'Жим']);
      expect(after.exercises[0]?.sets.every((set) => set.plannedWeight === 80)).toBe(true);
      const removed = after.exercises.find((exercise) => exercise.exercisePosition === 1);
      expect(removed?.sets).toHaveLength(2);
      expect(removed?.sets[0]).toMatchObject({
        id: removedSet.id,
        actualReps: 12,
        rpe: 7.5,
        isCompleted: true,
      });
      expect((await listSessions(app))[0]).toMatchObject({
        id: session.id,
        workoutNameSnapshot: before.workoutNameSnapshot,
      });
    });

    it('архивированный шаблон не удаляет сессию из списка и деталей', async () => {
      const workout = await createWorkout(app);
      const session = await startSession(app, workout.id);
      await completeSession(app, session.id);
      const before = await getSession(app, session.id);

      const deleted = await app.inject({ method: 'DELETE', url: `/api/workouts/${workout.id}` });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ result: 'archived' });
      expect((await getWorkouts(app)).some((item) => item.id === workout.id)).toBe(false);

      expect(await getSession(app, session.id)).toEqual(before);
      expect((await listSessions(app)).map((item) => item.id)).toContain(session.id);
    });
  });
});
