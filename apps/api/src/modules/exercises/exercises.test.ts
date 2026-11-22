import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiErrorBody, Exercise, ExchangeDocument, Session, Workout } from '@wt/shared';
import { EXCHANGE_SCHEMA_VERSION } from '@wt/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { exerciseMedia } from '../../db/schema';

type App = ReturnType<typeof buildApp>;

/** Ответ API содержит поля exerciseId/media, которых нет в ExerciseInput. */
function toInput(exercise: Workout['exercises'][number]) {
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

describe('библиотека упражнений (API)', () => {
  let dir: string;
  let dbPath: string;
  let app: App;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-exercises-'));
    dbPath = path.join(dir, 'test.db');
    app = buildApp({ dbPath });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function createWorkout(name: string, names: string[]): Promise<Workout> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      payload: { name, exercises: names.map((exerciseName) => ({ name: exerciseName, plannedSets: 2 })) },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as Workout;
  }

  async function getWorkout(id: string): Promise<Workout> {
    const res = await app.inject({ method: 'GET', url: `/api/workouts/${id}` });
    expect(res.statusCode).toBe(200);
    return res.json() as Workout;
  }

  async function library(): Promise<Exercise[]> {
    const res = await app.inject({ method: 'GET', url: '/api/exercises' });
    expect(res.statusCode).toBe(200);
    return res.json() as Exercise[];
  }

  function commit(mode: 'add' | 'replace', data: ExchangeDocument, confirmReplace?: boolean) {
    return app.inject({ method: 'POST', url: '/api/import/commit', payload: { mode, data, confirmReplace } });
  }

  it('создание шаблона добавляет его упражнения в библиотеку', async () => {
    const workout = await createWorkout('Ноги', ['Присед', 'Жим лёжа']);

    expect((await library()).map((exercise) => exercise.name).sort()).toEqual(['Жим лёжа', 'Присед']);
    const byName = new Map((await library()).map((exercise) => [exercise.name, exercise.id]));
    expect(workout.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      byName.get('Присед'),
      byName.get('Жим лёжа'),
    ]);
  });

  it('PATCH шаблона добавляет новое упражнение в библиотеку', async () => {
    const workout = await createWorkout('Верх', ['Жим лёжа']);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/workouts/${workout.id}`,
      payload: { exercises: [...workout.exercises.map(toInput), { name: 'Тяга', plannedSets: 3 }] },
    });

    expect(res.statusCode).toBe(200);
    const updated = res.json() as Workout;
    expect((await library()).map((exercise) => exercise.name).sort()).toEqual(['Жим лёжа', 'Тяга']);
    expect(updated.exercises[1]?.exerciseId).toBe((await library()).find((e) => e.name === 'Тяга')?.id);
  });

  it('нормализация: « жим  лежа » и «Жим лёжа» — одна запись с именем из первого появления', async () => {
    const first = await createWorkout('Первая', ['Жим лёжа']);
    const second = await createWorkout('Вторая', [' жим  лежа ']);
    const items = await library();

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Жим лёжа');
    expect((await getWorkout(first.id)).exercises[0]?.exerciseId).toBe(items[0]?.id);
    expect((await getWorkout(second.id)).exercises[0]?.exerciseId).toBe(items[0]?.id);
  });

  it('импорт в режиме add добавляет упражнения в библиотеку', async () => {
    const data: ExchangeDocument = {
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      workouts: [{ name: 'Импорт', exercises: [{ name: 'Импортное упражнение', plannedSets: 2 }] }],
    };

    const res = await commit('add', data);
    expect(res.statusCode).toBe(200);
    expect((await library()).map((exercise) => exercise.name)).toContain('Импортное упражнение');
  });

  it('импорт в режиме replace добавляет новые упражнения в библиотеку', async () => {
    const workout = await createWorkout('Замена', ['Старое упражнение']);
    const data: ExchangeDocument = {
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      workouts: [
        {
          id: workout.id,
          name: workout.name,
          exercises: [{ name: 'Новое упражнение', plannedSets: 2 }],
        },
      ],
    };

    const res = await commit('replace', data, true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ summary: { workoutsToUpdate: 1 } });
    expect((await library()).map((exercise) => exercise.name)).toContain('Новое упражнение');
  });

  it('backfill при старте восстанавливает библиотеку из существующих шаблонов', async () => {
    await createWorkout('Ноги', ['Присед']);
    expect((await library()).map((exercise) => exercise.name)).toContain('Присед');

    await app.close();
    const sqlite = new Database(dbPath);
    sqlite.prepare('DELETE FROM exercises').run();
    sqlite.close();

    app = buildApp({ dbPath });
    expect((await library()).map((exercise) => exercise.name)).toEqual(['Присед']);
  });

  it('список отсортирован по русской локали без учёта регистра', async () => {
    await createWorkout('Разное', ['ёлка', 'Яблоко', 'апельсин', 'Банан']);

    expect((await library()).map((exercise) => exercise.name)).toEqual(['апельсин', 'Банан', 'ёлка', 'Яблоко']);
  });

  it('exerciseId и media одинаковы для одного упражнения в двух шаблонах', async () => {
    const first = await createWorkout('Первый', ['Присед']);
    const second = await createWorkout('Второй', ['Присед']);
    const exerciseId = first.exercises[0]?.exerciseId;
    expect(exerciseId).toBeTruthy();

    const mediaId = crypto.randomUUID();
    app.db
      .insert(exerciseMedia)
      .values({ id: mediaId, exerciseId: exerciseId!, kind: 'image', createdAt: new Date().toISOString() })
      .run();

    const firstExercise = (await getWorkout(first.id)).exercises[0];
    const secondExercise = (await getWorkout(second.id)).exercises[0];
    const expectedMedia = [
      {
        id: mediaId,
        kind: 'image',
        url: `/media/${mediaId}.webp`,
        thumbUrl: `/media/${mediaId}.thumb.webp`,
      },
    ];
    expect(firstExercise?.exerciseId).toBe(exerciseId);
    expect(secondExercise?.exerciseId).toBe(exerciseId);
    expect(firstExercise?.media).toEqual(expectedMedia);
    expect(secondExercise?.media).toEqual(expectedMedia);
  });

  it('упражнение в ответе стартовавшей сессии содержит exerciseId', async () => {
    const workout = await createWorkout('Ноги', ['Тяга']);
    const res = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions` });
    expect(res.statusCode).toBe(201);

    const session = res.json() as Session;
    expect(session.exercises).toHaveLength(1);
    expect(session.exercises[0]?.exerciseId).toBe(workout.exercises[0]?.exerciseId);
    expect(session.exercises[0]?.media).toEqual([]);
  });

  it('удаление упражнения библиотеки не меняет шаблон: его упражнение отдаётся с media: []', async () => {
    const workout = await createWorkout('Ноги', ['Присед']);
    const exerciseId = workout.exercises[0]?.exerciseId;
    expect(exerciseId).toBeTruthy();
    const mediaId = crypto.randomUUID();
    app.db
      .insert(exerciseMedia)
      .values({ id: mediaId, exerciseId: exerciseId!, kind: 'image', createdAt: new Date().toISOString() })
      .run();
    expect((await getWorkout(workout.id)).exercises[0]?.media).toHaveLength(1);

    const res = await app.inject({ method: 'DELETE', url: `/api/exercises/${exerciseId}` });
    expect(res.statusCode).toBe(204);

    const after = (await getWorkout(workout.id)).exercises[0];
    expect(after).toMatchObject({ ...toInput(workout.exercises[0]!), position: 0 });
    expect(after?.media).toEqual([]);
    expect(after?.exerciseId).toBeNull();
    expect((await library()).map((exercise) => exercise.id)).not.toContain(exerciseId);
  });

  it('GET и DELETE неизвестного упражнения возвращают 404 NOT_FOUND', async () => {
    const unknown = crypto.randomUUID();
    const got = await app.inject({ method: 'GET', url: `/api/exercises/${unknown}` });
    expect(got.statusCode).toBe(404);
    expect((got.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');

    const deleted = await app.inject({ method: 'DELETE', url: `/api/exercises/${unknown}` });
    expect(deleted.statusCode).toBe(404);
    expect((deleted.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('экспорт не содержит полей exerciseId и media', async () => {
    const workout = await createWorkout('Ноги', ['Присед']);
    const started = await app.inject({ method: 'POST', url: `/api/workouts/${workout.id}/sessions` });
    expect(started.statusCode).toBe(201);
    const session = started.json() as Session;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${session.id}`,
      payload: {
        sets: session.exercises.flatMap((exercise) =>
          exercise.sets.map((set) => ({ id: set.id, isCompleted: true })),
        ),
      },
    });
    expect(patched.statusCode).toBe(200);
    const completed = await app.inject({ method: 'POST', url: `/api/sessions/${session.id}/complete`, payload: {} });
    expect(completed.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/export?includeSessions=true' });
    expect(res.statusCode).toBe(200);
    const document = res.json() as ExchangeDocument;
    expect(document.workouts).toHaveLength(1);
    expect(document.sessions).toHaveLength(1);

    const json = JSON.stringify(document);
    expect(json).not.toContain('"exerciseId"');
    expect(json).not.toContain('"media"');
  });
});
