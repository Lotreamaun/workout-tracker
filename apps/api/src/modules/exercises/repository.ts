import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { exerciseMedia, exercises, workoutExercises, workouts } from '../../db/schema';
import type { DbOrTx } from '../workouts/repository';

export type { DbOrTx };
export type ExerciseRow = typeof exercises.$inferSelect;
export type MediaRow = typeof exerciseMedia.$inferSelect;

// Пачки для вставки и IN: лимит переменных SQLite — не меньше 32766, берём с запасом.
const CHUNK = 500;

export function insertExercisesIgnore(db: DbOrTx, rows: (typeof exercises.$inferInsert)[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    db.insert(exercises)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({ target: exercises.nameKey })
      .run();
  }
}

export function listExerciseRows(db: DbOrTx): ExerciseRow[] {
  return db.select().from(exercises).all();
}

export function findExerciseRow(db: DbOrTx, id: string): ExerciseRow | undefined {
  return db.select().from(exercises).where(eq(exercises.id, id)).get();
}

export function findExerciseRowsByKeys(db: DbOrTx, keys: string[]): ExerciseRow[] {
  return db.select().from(exercises).where(inArray(exercises.nameKey, keys)).all();
}

export function deleteExerciseRow(db: DbOrTx, id: string) {
  db.delete(exercises).where(eq(exercises.id, id)).run();
}

/** Медиа в порядке добавления; без `exerciseIds` — всё медиа библиотеки. */
export function listMediaRows(db: DbOrTx, exerciseIds?: string[]): MediaRow[] {
  const query = db.select().from(exerciseMedia);
  return (exerciseIds ? query.where(inArray(exerciseMedia.exerciseId, exerciseIds)) : query)
    .orderBy(asc(exerciseMedia.createdAt), sql`rowid`)
    .all();
}

export function findMediaRow(db: DbOrTx, exerciseId: string, mediaId: string): MediaRow | undefined {
  return db
    .select()
    .from(exerciseMedia)
    .where(and(eq(exerciseMedia.id, mediaId), eq(exerciseMedia.exerciseId, exerciseId)))
    .get();
}

export function countMedia(db: DbOrTx, exerciseId: string): number {
  return (
    db.select({ count: count() }).from(exerciseMedia).where(eq(exerciseMedia.exerciseId, exerciseId)).get()?.count ?? 0
  );
}

export function insertMediaRow(db: DbOrTx, row: typeof exerciseMedia.$inferInsert) {
  db.insert(exerciseMedia).values(row).run();
}

export function deleteMediaRow(db: DbOrTx, id: string) {
  db.delete(exerciseMedia).where(eq(exerciseMedia.id, id)).run();
}

export function fillExerciseDescription(db: DbOrTx, nameKey: string, description: string): void {
  db.update(exercises)
    .set({ description })
    .where(and(eq(exercises.nameKey, nameKey), isNull(exercises.description)))
    .run();
}

export function listWorkoutExercisesForBackfill(db: DbOrTx): { name: string; description: string | null }[] {
  return db
    .select({ name: workoutExercises.name, description: workoutExercises.description })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .orderBy(asc(workouts.createdAt), asc(workouts.id), asc(workoutExercises.position))
    .all();
}
