import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { workoutExercises, workoutSessions, workouts } from '../../db/schema';

/** Корневой Db или транзакция Drizzle: репозиторий работает с обоими. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type WorkoutExerciseInsert = typeof workoutExercises.$inferInsert;

// Drizzle в списке select печатает колонки без префикса таблицы, из-за чего во вложенном подзапросе
// `workouts.id` разрешался бы в колонку внутренней таблицы. Явная ссылка нужна для коррелированных подзапросов.
const outerWorkoutId = sql.raw('"workouts"."id"');

export function listActiveWorkouts(db: DbOrTx) {
  return db
    .select({
      id: workouts.id,
      name: workouts.name,
      description: workouts.description,
      exerciseCount: sql<number>`(select count(*) from ${workoutExercises} where ${workoutExercises.workoutId} = ${outerWorkoutId})`,
      lastPerformedAt: sql<
        string | null
      >`(select max(${workoutSessions.completedAt}) from ${workoutSessions} where ${workoutSessions.workoutId} = ${outerWorkoutId} and ${workoutSessions.status} = 'completed')`,
      createdAt: workouts.createdAt,
      updatedAt: workouts.updatedAt,
    })
    .from(workouts)
    .where(isNull(workouts.archivedAt))
    .orderBy(desc(workouts.updatedAt))
    .all();
}

export function findWorkout(db: DbOrTx, id: string): WorkoutRow | undefined {
  return db.select().from(workouts).where(eq(workouts.id, id)).get();
}

export function listExercises(db: DbOrTx, workoutId: string): WorkoutExerciseRow[] {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
}

export function insertWorkout(db: DbOrTx, row: typeof workouts.$inferInsert) {
  db.insert(workouts).values(row).run();
}

export function updateWorkoutRow(db: DbOrTx, id: string, patch: Partial<typeof workouts.$inferInsert>) {
  db.update(workouts).set(patch).where(eq(workouts.id, id)).run();
}

export function deleteWorkoutRow(db: DbOrTx, id: string) {
  db.delete(workouts).where(eq(workouts.id, id)).run();
}

export function archiveWorkoutRow(db: DbOrTx, id: string, archivedAt: string) {
  db.update(workouts)
    .set({ archivedAt })
    .where(and(eq(workouts.id, id), isNull(workouts.archivedAt)))
    .run();
}

export function insertExercise(db: DbOrTx, row: WorkoutExerciseInsert) {
  db.insert(workoutExercises).values(row).run();
}

export function updateExercise(db: DbOrTx, id: string, patch: Partial<WorkoutExerciseInsert>) {
  db.update(workoutExercises).set(patch).where(eq(workoutExercises.id, id)).run();
}

export function deleteExercises(db: DbOrTx, ids: string[]) {
  if (ids.length === 0) return;
  db.delete(workoutExercises).where(inArray(workoutExercises.id, ids)).run();
}

export function countSessions(db: DbOrTx, workoutId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(workoutSessions)
    .where(eq(workoutSessions.workoutId, workoutId))
    .get();
  return row?.count ?? 0;
}
