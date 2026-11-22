import { asc, desc, eq, sql } from 'drizzle-orm';
import type { SessionStatus } from '@wt/shared';
import { setLogs, workoutSessions } from '../../db/schema';
import type { DbOrTx } from '../workouts/repository';

export type { DbOrTx };
export type SessionRow = typeof workoutSessions.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;
export type SetLogInsert = typeof setLogs.$inferInsert;

// Явная ссылка нужна для коррелированных подзапросов (см. listActiveWorkouts в workouts/repository.ts).
const outerSessionId = sql.raw('"workout_sessions"."id"');

export function findSession(db: DbOrTx, id: string): SessionRow | undefined {
  return db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
}

export function findInProgressSession(db: DbOrTx): SessionRow | undefined {
  return db.select().from(workoutSessions).where(eq(workoutSessions.status, 'in_progress')).get();
}

export function insertSession(db: DbOrTx, row: typeof workoutSessions.$inferInsert) {
  db.insert(workoutSessions).values(row).run();
}

export function updateSessionRow(db: DbOrTx, id: string, patch: Partial<typeof workoutSessions.$inferInsert>) {
  db.update(workoutSessions).set(patch).where(eq(workoutSessions.id, id)).run();
}

export function insertSetLogs(db: DbOrTx, rows: SetLogInsert[]) {
  if (rows.length === 0) return;
  db.insert(setLogs).values(rows).run();
}

export function listSetLogs(db: DbOrTx, sessionId: string): SetLogRow[] {
  return db
    .select()
    .from(setLogs)
    .where(eq(setLogs.sessionId, sessionId))
    .orderBy(asc(setLogs.exercisePosition), asc(setLogs.setNumber))
    .all();
}

export function updateSetLog(db: DbOrTx, id: string, patch: Partial<SetLogInsert>) {
  db.update(setLogs).set(patch).where(eq(setLogs.id, id)).run();
}

/** Пропуск хранится на всех подходах упражнения; возвращает число затронутых подходов. */
export function setExerciseSkipped(db: DbOrTx, sessionId: string, exercisePosition: number, isSkipped: boolean): number {
  return db
    .update(setLogs)
    .set({ isSkipped })
    .where(sql`${setLogs.sessionId} = ${sessionId} and ${setLogs.exercisePosition} = ${exercisePosition}`)
    .run().changes;
}

export function listSessions(db: DbOrTx, status: SessionStatus, limit: number) {
  return db
    .select({
      id: workoutSessions.id,
      workoutId: workoutSessions.workoutId,
      workoutNameSnapshot: workoutSessions.workoutNameSnapshot,
      status: workoutSessions.status,
      startedAt: workoutSessions.startedAt,
      completedAt: workoutSessions.completedAt,
      completedSets: sql<number>`(select count(*) from ${setLogs} where ${setLogs.sessionId} = ${outerSessionId} and ${setLogs.isCompleted} = 1)`,
      totalSets: sql<number>`(select count(*) from ${setLogs} where ${setLogs.sessionId} = ${outerSessionId})`,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.status, status))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit)
    .all();
}
