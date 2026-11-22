import { EXCHANGE_LIMITS, EXCHANGE_SCHEMA_VERSION, type ExchangeDocument, type ExchangeSession } from '@wt/shared';
import type { Db } from '../../db/client';
import * as sessionRepo from '../sessions/repository';
import { toSession } from '../sessions/service';
import * as workoutRepo from '../workouts/repository';
import * as repo from './repository';

function exportSession(db: Db, row: sessionRepo.SessionRow): ExchangeSession {
  const session = toSession(row, sessionRepo.listSetLogs(db, row.id));
  return {
    id: session.id,
    workoutId: session.workoutId,
    workoutNameSnapshot: session.workoutNameSnapshot,
    status: 'completed',
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? session.startedAt,
    notes: session.notes,
    exercises: session.exercises.map((exercise) => ({
      workoutExerciseId: exercise.workoutExerciseId,
      exercisePosition: exercise.exercisePosition,
      name: exercise.name,
      restSeconds: exercise.restSeconds,
      isSkipped: exercise.isSkipped,
      // id подходов в документ не попадает: при импорте подходы всегда создаются заново.
      sets: exercise.sets.map((set) => ({
        setNumber: set.setNumber,
        plannedReps: set.plannedReps,
        actualReps: set.actualReps,
        plannedWeight: set.plannedWeight,
        actualWeight: set.actualWeight,
        rpe: set.rpe,
        isCompleted: set.isCompleted,
        completedAt: set.completedAt,
        notes: set.notes,
      })),
    })),
  };
}

/**
 * Документ обмена v1: неархивированные шаблоны и (опционально) завершённые сессии.
 * Чтобы документ проходил схему импорта, берутся не более EXCHANGE_LIMITS.maxWorkouts шаблонов
 * и maxSessions самых новых сессий.
 */
export function buildExport(db: Db, includeSessions: boolean): ExchangeDocument {
  const workouts = repo.listActiveWorkoutRows(db).slice(0, EXCHANGE_LIMITS.maxWorkouts);

  const document: ExchangeDocument = {
    schemaVersion: EXCHANGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    workouts: workouts.map((workout) => ({
      id: workout.id,
      name: workout.name,
      description: workout.description,
      exercises: workoutRepo.listExercises(db, workout.id).map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        plannedSets: exercise.plannedSets,
        plannedReps: exercise.plannedReps,
        plannedWeight: exercise.plannedWeight,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
      })),
    })),
  };

  if (includeSessions) {
    document.sessions = repo
      .listCompletedSessionRows(db, EXCHANGE_LIMITS.maxSessions)
      .reverse()
      .map((row) => exportSession(db, row));
  }
  return document;
}
