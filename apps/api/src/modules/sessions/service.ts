import type {
  Session,
  SessionCompleteInput,
  SessionListItem,
  SessionListQuery,
  SessionPatchInput,
} from '@wt/shared';
import { ERROR_CODES, exerciseNameKey } from '@wt/shared';
import type { Db } from '../../db/client';
import { AppError } from '../../plugins/errors';
import { resolveExercises, type ExerciseLibrary } from '../exercises/service';
import * as workoutRepo from '../workouts/repository';
import * as repo from './repository';

function nullable<T>(value: T | null | undefined): T | null {
  return value === undefined || value === '' ? null : value;
}

function notFound(): never {
  throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Сессия не найдена');
}

/** `library` — упражнения библиотеки по ключу названия; без него (экспорт) `exerciseId` = null и `media` пуст. */
export function toSession(row: repo.SessionRow, sets: repo.SetLogRow[], library: ExerciseLibrary = new Map()): Session {
  // Упражнение сессии = группа подходов по exercisePosition; имя, отдых и пропуск берутся из первого подхода.
  const groups = new Map<number, repo.SetLogRow[]>();
  for (const set of sets) {
    const group = groups.get(set.exercisePosition);
    if (group) group.push(set);
    else groups.set(set.exercisePosition, [set]);
  }

  return {
    id: row.id,
    workoutId: row.workoutId,
    workoutNameSnapshot: row.workoutNameSnapshot,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    notes: row.notes,
    exercises: [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([exercisePosition, group]) => {
        const first = group[0]!;
        const libraryExercise = library.get(exerciseNameKey(first.exerciseNameSnapshot));
        return {
          workoutExerciseId: first.workoutExerciseId,
          exercisePosition,
          name: first.exerciseNameSnapshot,
          description: first.description,
          restSeconds: first.restSeconds,
          isSkipped: first.isSkipped,
          exerciseId: libraryExercise?.id ?? null,
          media: libraryExercise?.media ?? [],
          sets: group.map((s) => ({
            id: s.id,
            setNumber: s.setNumber,
            plannedReps: s.plannedReps,
            actualReps: s.actualReps,
            plannedWeight: s.plannedWeight,
            actualWeight: s.actualWeight,
            rpe: s.rpe,
            isCompleted: s.isCompleted,
            completedAt: s.completedAt,
            notes: s.notes,
          })),
        };
      }),
  };
}

function loadSession(db: repo.DbOrTx, id: string): Session {
  const row = repo.findSession(db, id);
  if (!row) notFound();
  const sets = repo.listSetLogs(db, id);
  const library = resolveExercises(
    db,
    sets.map((s) => s.exerciseNameSnapshot),
  );
  return toSession(row, sets, library);
}

export function getSession(db: Db, id: string): Session {
  return loadSession(db, id);
}

export function listSessions(db: Db, query: SessionListQuery): SessionListItem[] {
  return repo.listSessions(db, query.status, query.limit);
}

/** Создаёт сессию со snapshot названий и плановых значений шаблона на момент запуска. */
export function startSession(db: Db, workoutId: string): Session {
  return db.transaction((tx) => {
    const workout = workoutRepo.findWorkout(tx, workoutId);
    if (!workout) throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Тренировка не найдена');
    if (workout.archivedAt) {
      throw new AppError(ERROR_CODES.WORKOUT_ARCHIVED, 409, 'Тренировка в архиве, её нельзя запустить');
    }
    const exercises = workoutRepo.listExercises(tx, workoutId);
    if (exercises.length === 0) {
      throw new AppError(ERROR_CODES.WORKOUT_EMPTY, 409, 'В тренировке нет упражнений');
    }
    const active = repo.findInProgressSession(tx);
    if (active) {
      throw new AppError(ERROR_CODES.SESSION_IN_PROGRESS, 409, 'Уже есть активная тренировка', {
        sessionId: active.id,
      });
    }

    const sessionId = crypto.randomUUID();
    repo.insertSession(tx, {
      id: sessionId,
      workoutId,
      workoutNameSnapshot: workout.name,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: null,
      notes: null,
    });
    repo.insertSetLogs(
      tx,
      exercises.flatMap((exercise) =>
        Array.from({ length: exercise.plannedSets }, (_, index) => ({
          id: crypto.randomUUID(),
          sessionId,
          workoutExerciseId: exercise.id,
          exerciseNameSnapshot: exercise.name,
          description: exercise.description,
          exercisePosition: exercise.position,
          setNumber: index + 1,
          plannedReps: exercise.plannedReps,
          plannedWeight: exercise.plannedWeight,
          restSeconds: exercise.restSeconds,
        })),
      ),
    );
    return loadSession(tx, sessionId);
  });
}

function validationError(path: string, message: string): never {
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, message, [{ path, message }]);
}

export function patchSession(db: Db, id: string, input: SessionPatchInput): Session {
  return db.transaction((tx) => {
    const row = repo.findSession(tx, id);
    if (!row) notFound();
    if (row.status === 'abandoned') {
      throw new AppError(ERROR_CODES.SESSION_NOT_EDITABLE, 409, 'Отменённая тренировка не редактируется');
    }
    if (input.status === 'abandoned' && row.status !== 'in_progress') {
      throw new AppError(ERROR_CODES.SESSION_NOT_IN_PROGRESS, 409, 'Отменить можно только активную тренировку');
    }

    const now = new Date().toISOString();
    const existing = new Map(repo.listSetLogs(tx, id).map((s) => [s.id, s]));

    input.sets?.forEach((patch, index) => {
      const set = existing.get(patch.id);
      if (!set) validationError(`sets.${index}.id`, 'Подход не принадлежит этой сессии');

      const fields: Partial<repo.SetLogInsert> = {};
      if (patch.actualReps !== undefined) fields.actualReps = patch.actualReps;
      if (patch.actualWeight !== undefined) fields.actualWeight = patch.actualWeight;
      if (patch.rpe !== undefined) fields.rpe = patch.rpe;
      if (patch.notes !== undefined) fields.notes = nullable(patch.notes);
      if (patch.isCompleted !== undefined) {
        fields.isCompleted = patch.isCompleted;
        fields.completedAt = patch.isCompleted ? (set.completedAt ?? now) : null;
      }
      if (Object.keys(fields).length > 0) repo.updateSetLog(tx, patch.id, fields);
    });

    input.exercises?.forEach((patch, index) => {
      const changed = repo.setExerciseSkipped(tx, id, patch.exercisePosition, patch.isSkipped);
      if (changed === 0) validationError(`exercises.${index}.exercisePosition`, 'Неизвестное упражнение сессии');
    });

    const sessionPatch: Partial<repo.SessionRow> = {};
    if (input.notes !== undefined) sessionPatch.notes = nullable(input.notes);
    if (input.status === 'abandoned') sessionPatch.status = 'abandoned';
    if (Object.keys(sessionPatch).length > 0) repo.updateSessionRow(tx, id, sessionPatch);

    return loadSession(tx, id);
  });
}

export function completeSession(db: Db, id: string, input?: SessionCompleteInput | null): Session {
  return db.transaction((tx) => {
    const row = repo.findSession(tx, id);
    if (!row) notFound();
    if (row.status !== 'in_progress') {
      throw new AppError(ERROR_CODES.SESSION_NOT_IN_PROGRESS, 409, 'Тренировка не активна');
    }
    const patch: Partial<repo.SessionRow> = { status: 'completed', completedAt: new Date().toISOString() };
    if (input?.notes !== undefined) patch.notes = nullable(input.notes);
    repo.updateSessionRow(tx, id, patch);
    return loadSession(tx, id);
  });
}
