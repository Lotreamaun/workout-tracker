import type {
  DeleteWorkoutResult,
  ExerciseInput,
  Workout,
  WorkoutCreateInput,
  WorkoutListItem,
  WorkoutUpdateInput,
} from '@wt/shared';
import { ERROR_CODES } from '@wt/shared';
import type { Db } from '../../db/client';
import { AppError } from '../../plugins/errors';
import * as repo from './repository';

function nullable<T>(value: T | null | undefined): T | null {
  return value === undefined || value === '' ? null : value;
}

function toWorkout(row: repo.WorkoutRow, exercises: repo.WorkoutExerciseRow[]): Workout {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // imagePath намеренно не экспонируется (изображения вне MVP).
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      position: e.position,
      plannedSets: e.plannedSets,
      plannedReps: e.plannedReps,
      plannedWeight: e.plannedWeight,
      restSeconds: e.restSeconds,
      notes: e.notes,
    })),
  };
}

function loadWorkout(db: repo.DbOrTx, id: string): Workout {
  const row = repo.findWorkout(db, id);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Тренировка не найдена');
  return toWorkout(row, repo.listExercises(db, id));
}

function notFound(): never {
  throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Тренировка не найдена');
}

/**
 * Приводит упражнения тренировки к переданному упорядоченному списку (вызывать внутри транзакции):
 * элементы с `id` обновляются, без `id` создаются, отсутствующие удаляются, `position` = индекс.
 * Чужой/неизвестный `id` и дубли `id` → 400 VALIDATION_ERROR.
 */
export function syncWorkoutExercises(
  tx: repo.DbOrTx,
  workoutId: string,
  items: ExerciseInput[],
  now: string,
): void {
  const existing = repo.listExercises(tx, workoutId);
  const existingIds = new Set(existing.map((e) => e.id));

  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (item.id === undefined) return;
    if (!existingIds.has(item.id)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Упражнение не принадлежит этой тренировке',
        [{ path: `exercises.${index}.id`, message: 'Неизвестный id упражнения' }],
      );
    }
    if (seen.has(item.id)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'Упражнение передано дважды', [
        { path: `exercises.${index}.id`, message: 'Повторяющийся id упражнения' },
      ]);
    }
    seen.add(item.id);
  });

  repo.deleteExercises(
    tx,
    existing.filter((e) => !seen.has(e.id)).map((e) => e.id),
  );

  items.forEach((item, position) => {
    const fields = {
      name: item.name,
      description: nullable(item.description),
      position,
      plannedSets: item.plannedSets,
      plannedReps: nullable(item.plannedReps),
      plannedWeight: nullable(item.plannedWeight),
      restSeconds: nullable(item.restSeconds),
      notes: nullable(item.notes),
      updatedAt: now,
    };
    if (item.id !== undefined) {
      repo.updateExercise(tx, item.id, fields);
    } else {
      repo.insertExercise(tx, { id: crypto.randomUUID(), workoutId, createdAt: now, ...fields });
    }
  });
}

export function listWorkouts(db: Db): WorkoutListItem[] {
  return repo.listActiveWorkouts(db);
}

export function getWorkout(db: Db, id: string): Workout {
  return loadWorkout(db, id);
}

export function createWorkout(db: Db, input: WorkoutCreateInput): Workout {
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    repo.insertWorkout(tx, {
      id,
      name: input.name,
      description: nullable(input.description),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    syncWorkoutExercises(tx, id, input.exercises ?? [], now);
    return loadWorkout(tx, id);
  });
}

export function updateWorkout(db: Db, id: string, input: WorkoutUpdateInput): Workout {
  return db.transaction((tx) => {
    const row = repo.findWorkout(tx, id);
    if (!row) notFound();
    if (row.archivedAt) {
      throw new AppError(ERROR_CODES.WORKOUT_ARCHIVED, 409, 'Тренировка в архиве и не может быть изменена');
    }

    const now = new Date().toISOString();
    const patch: Partial<repo.WorkoutRow> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = nullable(input.description);
    repo.updateWorkoutRow(tx, id, patch);

    if (input.exercises !== undefined) syncWorkoutExercises(tx, id, input.exercises, now);
    return loadWorkout(tx, id);
  });
}

/** Нет сессий — физическое удаление; есть сессии — архивирование (история остаётся). */
export function deleteWorkout(db: Db, id: string): DeleteWorkoutResult {
  return db.transaction((tx) => {
    if (!repo.findWorkout(tx, id)) notFound();
    if (repo.countSessions(tx, id) > 0) {
      repo.archiveWorkoutRow(tx, id, new Date().toISOString());
      return { result: 'archived' as const };
    }
    repo.deleteWorkoutRow(tx, id);
    return { result: 'deleted' as const };
  });
}
