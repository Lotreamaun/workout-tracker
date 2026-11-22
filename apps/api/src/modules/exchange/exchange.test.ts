import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiErrorBody, ExchangeDocument, ImportMode, Session, Workout } from '@wt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app';
import * as workoutRepo from '../workouts/repository';

type App = ReturnType<typeof buildApp>;

const exercise = (name: string, plannedWeight: number) => ({
  name,
  plannedSets: 2,
  plannedReps: 8,
  plannedWeight,
  restSeconds: 90,
});

function details(response: { json(): unknown }): unknown {
  return (response.json() as ApiErrorBody).error.details;
}

describe('обмен данными (API)', () => {
  let dir: string;
  let app: App;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-exchange-'));
    app = buildApp({ dbPath: path.join(dir, 'test.db') });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function createWorkout(name: string): Promise<Workout> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      payload: { name, description: 'План', exercises: [exercise('Присед', 60), exercise('Жим', 40)] },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as Workout;
  }

  async function completeSession(workout: Workout): Promise<Session> {
    const started = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions` });
    expect(started.statusCode).toBe(201);
    const session = started.json() as Session;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${session.id}`,
      payload: {
        sets: session.exercises.flatMap((e) =>
          e.sets.map((set) => ({
            id: set.id,
            actualReps: 8,
            actualWeight: 42.5,
            rpe: 7,
            isCompleted: true,
          })),
        ),
      },
    });
    expect(patched.statusCode).toBe(200);

    const completed = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/complete`,
      payload: { notes: 'Хорошая тренировка' },
    });
    expect(completed.statusCode).toBe(200);
    return completed.json() as Session;
  }

  async function exportDocument(includeSessions = true): Promise<ExchangeDocument> {
    const res = await app.inject({ method: 'GET', url: `/api/export?includeSessions=${includeSessions}` });
    expect(res.statusCode).toBe(200);
    return res.json() as ExchangeDocument;
  }

  function preview(mode: ImportMode, data: unknown) {
    return app.inject({ method: 'POST', url: '/api/import/preview', payload: { mode, data } });
  }

  function commit(mode: ImportMode, data: unknown, confirmReplace?: boolean) {
    return app.inject({ method: 'POST', url: '/api/import/commit', payload: { mode, data, confirmReplace } });
  }

  async function workoutIds(): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: '/api/workouts' });
    expect(res.statusCode).toBe(200);
    return (res.json() as { id: string }[]).map((w) => w.id);
  }

  async function completedSessionIds(): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: '/api/sessions?status=completed&limit=100' });
    expect(res.statusCode).toBe(200);
    return (res.json() as { id: string }[]).map((s) => s.id);
  }

  async function getSession(id: string): Promise<Session> {
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${id}` });
    expect(res.statusCode).toBe(200);
    return res.json() as Session;
  }

  it('экспорт проходит проверку импорта (round-trip)', async () => {
    const workout = await createWorkout('Ноги');
    await completeSession(workout);

    const doc = await exportDocument();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.exportedAt).toBeDefined();
    expect(doc.workouts).toHaveLength(1);
    expect(doc.sessions).toHaveLength(1);
    expect(doc.workouts[0]?.exercises).toHaveLength(2);

    for (const mode of ['add', 'replace'] as const) {
      const res = await preview(mode, doc);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        mode,
        summary: {
          workoutsToCreate: mode === 'add' ? 1 : 0,
          workoutsToUpdate: mode === 'replace' ? 1 : 0,
          sessionsToCreate: 0,
          sessionsToSkip: 1,
        },
      });
    }
  });

  it('includeSessions=false убирает историю из экспорта', async () => {
    const workout = await createWorkout('Ноги');
    await completeSession(workout);

    const doc = await exportDocument(false);
    expect(doc.workouts).toHaveLength(1);
    expect(doc.sessions).toBeUndefined();

    const res = await preview('add', doc);
    expect(res.statusCode).toBe(200);
  });

  it('документ без schemaVersion отклоняется', async () => {
    const doc = await exportDocument(false);
    const res = await preview('add', { ...doc, schemaVersion: undefined });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(details(res)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'data.schemaVersion' })]),
    );
  });

  it('неподдерживаемая версия формата отклоняется', async () => {
    const doc = await exportDocument(false);
    const res = await preview('add', { ...doc, schemaVersion: 2 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'UNSUPPORTED_SCHEMA_VERSION' } });
  });

  it('неизвестные поля отклоняются с путём до поля', async () => {
    await createWorkout('Ноги');
    const doc = await exportDocument(false);
    const extra = await preview('add', { ...doc, unexpected: 1 });
    expect(extra.statusCode).toBe(400);
    expect(extra.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(details(extra)).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'data.unexpected' })]));

    const withImagePath = {
      ...doc,
      workouts: [{ ...doc.workouts[0]!, exercises: [{ ...doc.workouts[0]!.exercises[0]!, imagePath: '/tmp/a.png' }] }],
    };
    const image = await preview('add', withImagePath);
    expect(image.statusCode).toBe(400);
    expect(image.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(details(image)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'data.workouts.0.exercises.0.imagePath' })]),
    );
  });

  it('preview ничего не записывает в БД', async () => {
    const workout = await createWorkout('Ноги');
    await completeSession(workout);
    const beforeWorkouts = await workoutIds();
    const beforeSessions = await completedSessionIds();
    const doc = await exportDocument();

    for (const mode of ['add', 'replace'] as const) {
      const res = await preview(mode, { ...doc, workouts: [{ ...doc.workouts[0]!, name: 'Изменено' }] });
      expect(res.statusCode).toBe(200);
    }

    expect(await workoutIds()).toEqual(beforeWorkouts);
    expect(await completedSessionIds()).toEqual(beforeSessions);
  });

  it('режим add создаёт новые id и не трогает исходную тренировку', async () => {
    const original = await createWorkout('Ноги');
    const doc = await exportDocument(false);
    const data: ExchangeDocument = { ...doc, workouts: [{ ...doc.workouts[0]!, name: 'Ноги v2' }] };

    const res = await commit('add', data);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ summary: { workoutsToCreate: 1 } });

    const ids = await workoutIds();
    expect(ids).toHaveLength(2);
    const createdId = ids.find((id) => id !== original.id);
    expect(createdId).toBeDefined();

    const untouched = await app.inject({ method: 'GET', url: `/api/workouts/${original.id}` });
    expect(untouched.json()).toMatchObject({ name: 'Ноги' });
    const created = await app.inject({ method: 'GET', url: `/api/workouts/${createdId}` });
    expect(created.json()).toMatchObject({ name: 'Ноги v2' });
    expect((created.json() as Workout).exercises.map((e) => e.id)).not.toEqual(original.exercises.map((e) => e.id));
  });

  it('replace без подтверждения не меняет данные', async () => {
    const workout = await createWorkout('Ноги');
    await completeSession(workout);
    const beforeWorkouts = await workoutIds();
    const beforeSessions = await completedSessionIds();
    const doc = await exportDocument(false);
    const data = { ...doc, workouts: [{ ...doc.workouts[0]!, name: 'Ноги v2' }] };

    const res = await commit('replace', data);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' } });
    expect(await workoutIds()).toEqual(beforeWorkouts);
    expect(await completedSessionIds()).toEqual(beforeSessions);
    const stored = await app.inject({ method: 'GET', url: `/api/workouts/${workout.id}` });
    expect(stored.json()).toMatchObject({ name: 'Ноги' });
  });

  it('replace с подтверждением обновляет тренировку и сохраняет историю', async () => {
    const workout = await createWorkout('Ноги');
    const session = await completeSession(workout);

    // Третье упражнение добавляется после сессии: его удаление не затрагивает историю.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/workouts/${workout.id}`,
      payload: {
        exercises: [
          ...workout.exercises.map((e) => ({
            id: e.id,
            name: e.name,
            plannedSets: e.plannedSets,
            plannedReps: e.plannedReps,
            plannedWeight: e.plannedWeight,
            restSeconds: e.restSeconds,
          })),
          exercise('Становая', 80),
        ],
      },
    });
    expect(patched.statusCode).toBe(200);
    const withThirdExercise = patched.json() as Workout;

    const doc = await exportDocument();
    const source = doc.workouts.find((w) => w.id === workout.id)!;
    const data: ExchangeDocument = {
      ...doc,
      workouts: [
        {
          ...source,
          name: 'Ноги (обновлено)',
          exercises: [
            { ...source.exercises[0]!, plannedWeight: 70 },
            source.exercises[1]!,
            { name: 'Новое упражнение', plannedSets: 3, plannedReps: 12 },
          ],
        },
      ],
    };

    const res = await commit('replace', data, true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      summary: { workoutsToUpdate: 1, workoutsToCreate: 0, exercisesToCreate: 1, sessionsToSkip: 1 },
    });

    const updated = await app.inject({ method: 'GET', url: `/api/workouts/${workout.id}` });
    expect(updated.statusCode).toBe(200);
    const stored = updated.json() as Workout;
    expect(stored.id).toBe(workout.id);
    expect(stored.name).toBe('Ноги (обновлено)');
    expect(stored.exercises).toHaveLength(3);
    const storedIds = stored.exercises.map((e) => e.id);
    expect(storedIds).toContain(source.exercises[0]!.id);
    expect(storedIds).toContain(source.exercises[1]!.id);
    expect(storedIds).not.toContain(withThirdExercise.exercises[2]!.id);
    expect(stored.exercises.find((e) => e.id === source.exercises[0]!.id)?.plannedWeight).toBe(70);
    expect(stored.exercises.find((e) => !source.exercises.some((old) => old.id === e.id))?.name).toBe('Новое упражнение');

    expect(await getSession(session.id)).toEqual(session);
    expect(await completedSessionIds()).toEqual([session.id]);
  });

  it('повторный импорт экспорта с историей пропускает все сессии', async () => {
    const workout = await createWorkout('Ноги');
    const session = await completeSession(workout);
    const doc = await exportDocument();

    const res = await commit('add', doc);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ summary: { sessionsToCreate: 0, sessionsToSkip: 1 } });
    expect(await completedSessionIds()).toEqual([session.id]);
    expect(await workoutIds()).toHaveLength(2);
  });

  it('импорт в свежую БД создаёт сессии со ссылками на новые тренировки', async () => {
    const workout = await createWorkout('Ноги');
    await completeSession(workout);
    const doc = await exportDocument();

    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-exchange-import-'));
    const otherApp = buildApp({ dbPath: path.join(otherDir, 'fresh.db') });
    try {
      const res = await otherApp.inject({ method: 'POST', url: '/api/import/commit', payload: { mode: 'add', data: doc } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ summary: { workoutsToCreate: 1, sessionsToCreate: 1 } });

      const list = await otherApp.inject({ method: 'GET', url: '/api/workouts' });
      const created = (list.json() as { id: string }[])[0]!;
      expect(created.id).not.toBe(workout.id);

      const sessionsList = await otherApp.inject({ method: 'GET', url: '/api/sessions?status=completed' });
      const sessions = sessionsList.json() as { id: string }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).not.toBe(doc.sessions![0]!.id);

      const imported = await otherApp.inject({ method: 'GET', url: `/api/sessions/${sessions[0]!.id}` });
      const session = imported.json() as Session;
      expect(session.workoutId).toBe(created.id);
      expect(session.workoutNameSnapshot).toBe(doc.sessions![0]!.workoutNameSnapshot);
      expect(session.exercises.length).toBeGreaterThan(0);

      const detail = await otherApp.inject({ method: 'GET', url: `/api/workouts/${created.id}` });
      const newExerciseIds = (detail.json() as Workout).exercises.map((e) => e.id);
      for (const importedExercise of session.exercises) {
        expect(importedExercise.workoutExerciseId).not.toBeNull();
        expect(newExerciseIds).toContain(importedExercise.workoutExerciseId);
      }
    } finally {
      await otherApp.close();
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('откатывает весь импорт при ошибке записи второй тренировки', async () => {
    await createWorkout('Ноги');
    await createWorkout('Верх');
    const beforeWorkouts = await workoutIds();
    const doc = await exportDocument(false);
    expect(doc.workouts).toHaveLength(2);

    const insertWorkout = workoutRepo.insertWorkout;
    let calls = 0;
    vi.spyOn(workoutRepo, 'insertWorkout').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) throw new Error('Сбой записи');
      return insertWorkout(...args);
    });

    const res = await commit('add', doc);
    expect(res.statusCode).toBe(500);
    expect(await workoutIds()).toEqual(beforeWorkouts);
  });

  it('отвергает тело запроса больше 5 МБ', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/preview',
      payload: { mode: 'add', data: { schemaVersion: 1, workouts: [], padding: 'x'.repeat(5 * 1024 * 1024) } },
    });
    expect(res.statusCode).toBe(413);
  });
});
