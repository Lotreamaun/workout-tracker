import { z } from 'zod';

export const WORKOUT_LIMITS = {
  nameMax: 120,
  textMax: 2000,
  maxExercises: 50,
  setsMax: 50,
  repsMax: 1000,
  weightMax: 2000,
  restMax: 3600,
} as const;

const name = z.string().trim().min(1, 'Укажите название').max(WORKOUT_LIMITS.nameMax);
const text = z.string().trim().max(WORKOUT_LIMITS.textMax);

// Опциональные поля ввода: отсутствие или null = «не задано». Пустая строка текста сохраняется как null.
const optionalText = text.nullish();
const optionalReps = z.number().int().min(1).max(WORKOUT_LIMITS.repsMax).nullish();
const optionalWeight = z.number().min(0).max(WORKOUT_LIMITS.weightMax).nullish();
const optionalRest = z.number().int().min(0).max(WORKOUT_LIMITS.restMax).nullish();

export const exerciseInputSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name,
  description: optionalText,
  plannedSets: z.number().int().min(1).max(WORKOUT_LIMITS.setsMax),
  plannedReps: optionalReps,
  plannedWeight: optionalWeight,
  restSeconds: optionalRest,
  notes: optionalText,
});

const exercisesInput = z.array(exerciseInputSchema).max(WORKOUT_LIMITS.maxExercises);

export const workoutCreateInputSchema = z.strictObject({
  name,
  description: optionalText,
  exercises: exercisesInput.optional(),
});

export const workoutUpdateInputSchema = z.strictObject({
  name: name.optional(),
  description: optionalText,
  exercises: exercisesInput.optional(),
});

export const workoutExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  plannedSets: z.number().int(),
  plannedReps: z.number().int().nullable(),
  plannedWeight: z.number().nullable(),
  restSeconds: z.number().int().nullable(),
  notes: z.string().nullable(),
});

export const workoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  exercises: z.array(workoutExerciseSchema),
});

export const workoutListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  exerciseCount: z.number().int(),
  lastPerformedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workoutListSchema = z.array(workoutListItemSchema);

export const workoutIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const deleteWorkoutResultSchema = z.object({
  result: z.enum(['deleted', 'archived']),
});

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type WorkoutCreateInput = z.infer<typeof workoutCreateInputSchema>;
export type WorkoutUpdateInput = z.infer<typeof workoutUpdateInputSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
export type DeleteWorkoutResult = z.infer<typeof deleteWorkoutResultSchema>;
