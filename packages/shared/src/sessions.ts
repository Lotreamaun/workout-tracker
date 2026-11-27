import { z } from 'zod';
import { exerciseMediaSchema } from './exercises';
import { WORKOUT_LIMITS } from './workouts';

export const SESSION_LIMITS = {
  rpeMin: 1,
  rpeMax: 10,
  rpeStep: 0.5,
  listLimitDefault: 50,
  listLimitMax: 100,
} as const;

export const sessionStatusSchema = z.enum(['in_progress', 'completed', 'abandoned']);

const notes = z.string().trim().max(WORKOUT_LIMITS.textMax);

// Фактические значения: null сбрасывает поле, отсутствие ключа оставляет без изменений.
const actualReps = z.number().int().min(0).max(WORKOUT_LIMITS.repsMax).nullable();
const actualWeight = z.number().min(0).max(WORKOUT_LIMITS.weightMax).nullable();
const rpe = z.number().min(SESSION_LIMITS.rpeMin).max(SESSION_LIMITS.rpeMax).multipleOf(SESSION_LIMITS.rpeStep).nullable();

/** Ограничения фактических значений подходов; переиспользуются форматом обмена. */
export const sessionFieldSchemas = { notes, actualReps, actualWeight, rpe } as const;

export const sessionSetPatchSchema = z.strictObject({
  id: z.string().min(1).max(64),
  actualReps: actualReps.optional(),
  actualWeight: actualWeight.optional(),
  rpe: rpe.optional(),
  isCompleted: z.boolean().optional(),
  notes: notes.nullable().optional(),
});

export const sessionExercisePatchSchema = z.strictObject({
  exercisePosition: z.number().int().min(0),
  isSkipped: z.boolean(),
});

export const sessionPatchInputSchema = z.strictObject({
  notes: notes.nullable().optional(),
  status: z.literal('abandoned').optional(),
  sets: z.array(sessionSetPatchSchema).max(WORKOUT_LIMITS.maxExercises * WORKOUT_LIMITS.setsMax).optional(),
  exercises: z.array(sessionExercisePatchSchema).max(WORKOUT_LIMITS.maxExercises).optional(),
});

export const sessionCompleteInputSchema = z.strictObject({
  notes: notes.nullable().optional(),
});

export const sessionIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const sessionListQuerySchema = z.object({
  status: sessionStatusSchema.default('completed'),
  limit: z.coerce.number().int().min(1).max(SESSION_LIMITS.listLimitMax).default(SESSION_LIMITS.listLimitDefault),
});

export const sessionSetSchema = z.object({
  id: z.string(),
  setNumber: z.number().int(),
  plannedReps: z.number().int().nullable(),
  actualReps: z.number().int().nullable(),
  plannedWeight: z.number().nullable(),
  actualWeight: z.number().nullable(),
  rpe: z.number().nullable(),
  isCompleted: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
});

export const sessionExerciseSchema = z.object({
  // null, если упражнение шаблона позже удалено (snapshot остаётся).
  workoutExerciseId: z.string().nullable(),
  exercisePosition: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  restSeconds: z.number().int().nullable(),
  isSkipped: z.boolean(),
  // Связь с библиотекой по нормализованному названию из снимка; только для чтения.
  exerciseId: z.string().nullable(),
  media: z.array(exerciseMediaSchema),
  sets: z.array(sessionSetSchema),
});

export const sessionSchema = z.object({
  id: z.string(),
  workoutId: z.string().nullable(),
  workoutNameSnapshot: z.string(),
  status: sessionStatusSchema,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  exercises: z.array(sessionExerciseSchema),
});

export const sessionListItemSchema = z.object({
  id: z.string(),
  workoutId: z.string().nullable(),
  workoutNameSnapshot: z.string(),
  status: sessionStatusSchema,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  completedSets: z.number().int(),
  totalSets: z.number().int(),
});

export const sessionListSchema = z.array(sessionListItemSchema);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SessionSetPatch = z.infer<typeof sessionSetPatchSchema>;
export type SessionExercisePatch = z.infer<typeof sessionExercisePatchSchema>;
export type SessionPatchInput = z.infer<typeof sessionPatchInputSchema>;
export type SessionCompleteInput = z.infer<typeof sessionCompleteInputSchema>;
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
export type SessionSet = z.infer<typeof sessionSetSchema>;
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionListItem = z.infer<typeof sessionListItemSchema>;
