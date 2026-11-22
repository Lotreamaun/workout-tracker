import { asc, desc, eq, isNull } from 'drizzle-orm';
import { workoutExercises, workoutSessions, workouts } from '../../db/schema';
import type { DbOrTx } from '../workouts/repository';
import * as sessionRepo from '../sessions/repository';

export type { DbOrTx };

/** Неархивированные шаблоны в порядке создания. */
export function listActiveWorkoutRows(db: DbOrTx) {
  return db
    .select()
    .from(workouts)
    .where(isNull(workouts.archivedAt))
    .orderBy(asc(workouts.createdAt), asc(workouts.id))
    .all();
}

/** Самые новые завершённые сессии (по убыванию startedAt). */
export function listCompletedSessionRows(db: DbOrTx, limit: number) {
  return db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.status, 'completed'))
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(limit)
    .all();
}

export function exerciseExists(db: DbOrTx, id: string): boolean {
  return (
    db.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.id, id)).get() !==
    undefined
  );
}

/** Вставка подходов порциями: у SQLite ограничено число параметров в одном запросе. */
export function insertSetLogsChunked(db: DbOrTx, rows: sessionRepo.SetLogInsert[], chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    sessionRepo.insertSetLogs(db, rows.slice(i, i + chunkSize));
  }
}
