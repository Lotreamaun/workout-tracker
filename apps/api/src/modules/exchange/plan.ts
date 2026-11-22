import type { ExchangeDocument, ExerciseInput, ImportMode, ImportResult } from '@wt/shared';
import * as sessionRepo from '../sessions/repository';
import * as workoutRepo from '../workouts/repository';
import * as repo from './repository';

type PlannedExerciseCreate = { id: string; input: ExerciseInput };

export type PlannedWorkout =
  | {
      action: 'create';
      id: string;
      name: string;
      description: string | null;
      exercises: PlannedExerciseCreate[];
    }
  | {
      action: 'update';
      id: string;
      name: string;
      /** undefined — не менять (как в PATCH), null — очистить. */
      description: string | null | undefined;
      /** Для syncWorkoutExercises: id оставлен только у упражнений, принадлежащих этой тренировке. */
      exercises: ExerciseInput[];
    };

export interface PlannedSession {
  id: string;
  workoutId: string | null;
  workoutNameSnapshot: string;
  startedAt: string;
  completedAt: string;
  notes: string | null;
  setLogs: sessionRepo.SetLogInsert[];
}

export interface ImportPlan {
  mode: ImportMode;
  workouts: PlannedWorkout[];
  sessions: PlannedSession[];
  sessionsToSkip: number;
  warnings: string[];
}

function nullable<T>(value: T | null | undefined): T | null {
  return value === undefined || value === '' ? null : value;
}

function normalizeIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function withoutId(exercise: ExerciseInput): ExerciseInput {
  const copy = { ...exercise };
  delete copy.id;
  return copy;
}

function nameList(names: string[]): string {
  const shown = names.slice(0, 5).map((n) => `«${n}»`);
  return names.length > 5 ? `${shown.join(', ')} и ещё ${names.length - 5}` : shown.join(', ');
}

/**
 * Строит план импорта, только читая БД (preview и commit используют один и тот же план):
 * - add: все тренировки новые; replace: совпавшие по id неархивированные тренировки обновляются, остальные создаются;
 * - все создаваемые записи получают новые UUID, ссылки сессий переписываются через карты doc-id → id в БД;
 * - сессия с id, уже существующим в БД (или повторным в документе), пропускается.
 */
export function planImport(db: repo.DbOrTx, doc: ExchangeDocument, mode: ImportMode): ImportPlan {
  const warnings: string[] = [];
  const workouts: PlannedWorkout[] = [];
  const workoutIdMap = new Map<string, string>();
  const exerciseIdMap = new Map<string, string>();
  // Упражнения существующих тренировок, которые replace удалит: ссылаться на них из новых сессий нельзя.
  const removedExerciseIds = new Set<string>();

  for (const workout of doc.workouts) {
    let match: workoutRepo.WorkoutRow | undefined;
    if (mode === 'replace' && workout.id !== undefined) {
      if (workoutIdMap.has(workout.id)) {
        warnings.push(`Тренировка «${workout.name}»: id повторяется в документе, создаётся как новая`);
      } else {
        const row = workoutRepo.findWorkout(db, workout.id);
        if (row && !row.archivedAt) match = row;
        else if (row) warnings.push(`Тренировка «${workout.name}» в архиве и не обновляется, создаётся как новая`);
      }
    }

    if (match) {
      const existing = workoutRepo.listExercises(db, match.id);
      const existingIds = new Set(existing.map((e) => e.id));
      const kept = new Set<string>();
      const detached: string[] = [];
      const exercises = workout.exercises.map((exercise) => {
        if (exercise.id === undefined) return exercise;
        if (existingIds.has(exercise.id) && !kept.has(exercise.id)) {
          kept.add(exercise.id);
          if (!exerciseIdMap.has(exercise.id)) exerciseIdMap.set(exercise.id, exercise.id);
          return exercise;
        }
        detached.push(exercise.name);
        return withoutId(exercise);
      });
      for (const e of existing) if (!kept.has(e.id)) removedExerciseIds.add(e.id);
      if (detached.length > 0) {
        warnings.push(
          `Тренировка «${workout.name}»: id упражнений не найден в этой тренировке или повторяется — созданы как новые: ${nameList(detached)}`,
        );
      }
      if (workout.id !== undefined) workoutIdMap.set(workout.id, match.id);
      workouts.push({
        action: 'update',
        id: match.id,
        name: workout.name,
        description: workout.description === undefined ? undefined : nullable(workout.description),
        exercises,
      });
    } else {
      const id = crypto.randomUUID();
      if (workout.id !== undefined && !workoutIdMap.has(workout.id)) workoutIdMap.set(workout.id, id);
      workouts.push({
        action: 'create',
        id,
        name: workout.name,
        description: nullable(workout.description),
        exercises: workout.exercises.map((exercise) => {
          const exerciseId = crypto.randomUUID();
          if (exercise.id !== undefined && !exerciseIdMap.has(exercise.id)) exerciseIdMap.set(exercise.id, exerciseId);
          return { id: exerciseId, input: withoutId(exercise) };
        }),
      });
    }
  }

  const workoutExists = new Map<string, boolean>();
  const resolveWorkout = (docId: string | null | undefined): string | null => {
    if (docId == null) return null;
    const mapped = workoutIdMap.get(docId);
    if (mapped) return mapped;
    let exists = workoutExists.get(docId);
    if (exists === undefined) {
      exists = workoutRepo.findWorkout(db, docId) !== undefined;
      workoutExists.set(docId, exists);
    }
    return exists ? docId : null;
  };
  const exerciseExists = new Map<string, boolean>();
  const resolveExercise = (docId: string | null | undefined): string | null => {
    if (docId == null) return null;
    const mapped = exerciseIdMap.get(docId);
    if (mapped) return mapped;
    if (removedExerciseIds.has(docId)) return null;
    let exists = exerciseExists.get(docId);
    if (exists === undefined) {
      exists = repo.exerciseExists(db, docId);
      exerciseExists.set(docId, exists);
    }
    return exists ? docId : null;
  };

  const sessions: PlannedSession[] = [];
  const seenSessionIds = new Set<string>();
  let sessionsToSkip = 0;
  let duplicatesInDocument = 0;
  let droppedWorkoutRefs = 0;
  let droppedExerciseRefs = 0;

  for (const session of doc.sessions ?? []) {
    if (session.id !== undefined) {
      if (seenSessionIds.has(session.id)) {
        sessionsToSkip += 1;
        duplicatesInDocument += 1;
        continue;
      }
      seenSessionIds.add(session.id);
      if (sessionRepo.findSession(db, session.id)) {
        sessionsToSkip += 1;
        continue;
      }
    }

    const sessionId = crypto.randomUUID();
    const workoutId = resolveWorkout(session.workoutId);
    if (session.workoutId != null && workoutId === null) droppedWorkoutRefs += 1;

    const setLogs: sessionRepo.SetLogInsert[] = [];
    for (const exercise of session.exercises) {
      const workoutExerciseId = resolveExercise(exercise.workoutExerciseId);
      if (exercise.workoutExerciseId != null && workoutExerciseId === null) droppedExerciseRefs += 1;
      for (const set of exercise.sets) {
        setLogs.push({
          id: crypto.randomUUID(),
          sessionId,
          workoutExerciseId,
          exerciseNameSnapshot: exercise.name,
          exercisePosition: exercise.exercisePosition,
          setNumber: set.setNumber,
          plannedReps: nullable(set.plannedReps),
          actualReps: nullable(set.actualReps),
          plannedWeight: nullable(set.plannedWeight),
          actualWeight: nullable(set.actualWeight),
          restSeconds: nullable(exercise.restSeconds),
          rpe: nullable(set.rpe),
          isCompleted: set.isCompleted,
          isSkipped: exercise.isSkipped,
          completedAt: set.completedAt ? normalizeIso(set.completedAt) : null,
          notes: nullable(set.notes),
        });
      }
    }

    sessions.push({
      id: sessionId,
      workoutId,
      workoutNameSnapshot: session.workoutNameSnapshot,
      startedAt: normalizeIso(session.startedAt),
      completedAt: normalizeIso(session.completedAt),
      notes: nullable(session.notes),
      setLogs,
    });
  }

  if (duplicatesInDocument > 0) {
    warnings.push(`Сессии с повторяющимся в документе id пропущены: ${duplicatesInDocument}`);
  }
  if (droppedWorkoutRefs > 0) {
    warnings.push(`У сессий (${droppedWorkoutRefs}) не найдена тренировка — ссылка на неё сброшена`);
  }
  if (droppedExerciseRefs > 0) {
    warnings.push(`У упражнений сессий (${droppedExerciseRefs}) не найдено упражнение шаблона — ссылка сброшена`);
  }

  return { mode, workouts, sessions, sessionsToSkip, warnings };
}

/** Сводка плана в формате ответа preview/commit. */
export function summarizePlan(plan: ImportPlan): ImportResult {
  const exercisesToCreate = plan.workouts.reduce(
    (sum, w) => sum + (w.action === 'create' ? w.exercises.length : w.exercises.filter((e) => e.id === undefined).length),
    0,
  );
  return {
    mode: plan.mode,
    workouts: plan.workouts.map((w) => ({ name: w.name, action: w.action, exerciseCount: w.exercises.length })),
    summary: {
      workoutsToCreate: plan.workouts.filter((w) => w.action === 'create').length,
      workoutsToUpdate: plan.workouts.filter((w) => w.action === 'update').length,
      exercisesToCreate,
      sessionsToCreate: plan.sessions.length,
      sessionsToSkip: plan.sessionsToSkip,
      setsToCreate: plan.sessions.reduce((sum, s) => sum + s.setLogs.length, 0),
    },
    warnings: plan.warnings,
  };
}
