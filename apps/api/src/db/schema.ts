import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    plannedSets: integer('planned_sets').notNull(),
    plannedReps: integer('planned_reps'),
    plannedWeight: real('planned_weight'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    imagePath: text('image_path'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('workout_exercises_workout_position_idx').on(table.workoutId, table.position)],
);

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id').references(() => workouts.id, { onDelete: 'set null' }),
    workoutNameSnapshot: text('workout_name_snapshot').notNull(),
    status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] }).notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    notes: text('notes'),
  },
  (table) => [
    index('workout_sessions_workout_id_idx').on(table.workoutId),
    index('workout_sessions_started_at_idx').on(table.startedAt),
  ],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    workoutExerciseId: text('workout_exercise_id').references(() => workoutExercises.id, {
      onDelete: 'set null',
    }),
    exerciseNameSnapshot: text('exercise_name_snapshot').notNull(),
    description: text('description'),
    exercisePosition: integer('exercise_position').notNull(),
    setNumber: integer('set_number').notNull(),
    plannedReps: integer('planned_reps'),
    actualReps: integer('actual_reps'),
    plannedWeight: real('planned_weight'),
    actualWeight: real('actual_weight'),
    restSeconds: integer('rest_seconds'),
    rpe: real('rpe'),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    isSkipped: integer('is_skipped', { mode: 'boolean' }).notNull().default(false),
    completedAt: text('completed_at'),
    notes: text('notes'),
  },
  (table) => [index('set_logs_session_id_idx').on(table.sessionId)],
);

// Библиотека упражнений: связь с шаблонами и сессиями — по name_key (нормализованное название), без FK.
export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameKey: text('name_key').notNull().unique(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
});

export const exerciseMedia = sqliteTable(
  'exercise_media',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['image', 'video'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('exercise_media_exercise_created_idx').on(table.exerciseId, table.createdAt)],
);
