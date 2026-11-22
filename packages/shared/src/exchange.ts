import { z } from 'zod';
import { sessionFieldSchemas } from './sessions';
import { WORKOUT_LIMITS, exerciseInputSchema, workoutCreateInputSchema } from './workouts';

export const EXCHANGE_SCHEMA_VERSION = 1;

export const EXCHANGE_LIMITS = {
  maxWorkouts: 200,
  maxSessions: 2000,
  /** Лимит тела запросов импорта (preview/commit), байт. */
  bodyLimitBytes: 5 * 1024 * 1024,
} as const;

const id = z.string().min(1).max(64);

// Ограничения полей берутся из workout-builder (exerciseInputSchema) и workout-tracker (sessionFieldSchemas).
// Везде strictObject: неизвестные поля (в т.ч. imagePath) отклоняются.

export const exchangeWorkoutSchema = z.strictObject({
  id: exerciseInputSchema.shape.id,
  name: workoutCreateInputSchema.shape.name,
  description: workoutCreateInputSchema.shape.description,
  exercises: workoutCreateInputSchema.shape.exercises.unwrap(),
});

export const exchangeSessionSetSchema = z.strictObject({
  setNumber: z.number().int().min(1).max(WORKOUT_LIMITS.setsMax),
  plannedReps: exerciseInputSchema.shape.plannedReps,
  actualReps: sessionFieldSchemas.actualReps.optional(),
  plannedWeight: exerciseInputSchema.shape.plannedWeight,
  actualWeight: sessionFieldSchemas.actualWeight.optional(),
  rpe: sessionFieldSchemas.rpe.optional(),
  isCompleted: z.boolean(),
  completedAt: z.iso.datetime().nullish(),
  notes: sessionFieldSchemas.notes.nullish(),
});

export const exchangeSessionExerciseSchema = z
  .strictObject({
    workoutExerciseId: id.nullish(),
    exercisePosition: z
      .number()
      .int()
      .min(0)
      .max(WORKOUT_LIMITS.maxExercises - 1),
    name: exerciseInputSchema.shape.name,
    restSeconds: exerciseInputSchema.shape.restSeconds,
    isSkipped: z.boolean(),
    sets: z.array(exchangeSessionSetSchema).min(1).max(WORKOUT_LIMITS.setsMax),
  })
  .superRefine((exercise, ctx) => {
    const seen = new Set<number>();
    exercise.sets.forEach((set, index) => {
      if (seen.has(set.setNumber)) {
        ctx.addIssue({ code: 'custom', path: ['sets', index, 'setNumber'], message: 'Повторяющийся номер подхода' });
      }
      seen.add(set.setNumber);
    });
  });

export const exchangeSessionSchema = z
  .strictObject({
    id: id.optional(),
    workoutId: id.nullish(),
    workoutNameSnapshot: workoutCreateInputSchema.shape.name,
    status: z.literal('completed'),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    notes: sessionFieldSchemas.notes.nullish(),
    exercises: z.array(exchangeSessionExerciseSchema).min(1).max(WORKOUT_LIMITS.maxExercises),
  })
  .superRefine((session, ctx) => {
    const seen = new Set<number>();
    session.exercises.forEach((exercise, index) => {
      if (seen.has(exercise.exercisePosition)) {
        ctx.addIssue({
          code: 'custom',
          path: ['exercises', index, 'exercisePosition'],
          message: 'Повторяющаяся позиция упражнения',
        });
      }
      seen.add(exercise.exercisePosition);
    });
  });

export const exchangeDocumentSchema = z.strictObject({
  schemaVersion: z.literal(EXCHANGE_SCHEMA_VERSION),
  exportedAt: z.iso.datetime().optional(),
  workouts: z.array(exchangeWorkoutSchema).max(EXCHANGE_LIMITS.maxWorkouts),
  sessions: z.array(exchangeSessionSchema).max(EXCHANGE_LIMITS.maxSessions).optional(),
});

export const exportQuerySchema = z.object({
  includeSessions: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export const importModeSchema = z.enum(['add', 'replace']);

// `data` проверяется сервисом отдельно (сначала schemaVersion → UNSUPPORTED_SCHEMA_VERSION, затем полная схема),
// поэтому в теле запроса это unknown.
export const importPreviewInputSchema = z.strictObject({
  mode: importModeSchema,
  data: z.unknown(),
});

export const importCommitInputSchema = z.strictObject({
  mode: importModeSchema,
  data: z.unknown(),
  confirmReplace: z.boolean().optional(),
});

export const importWorkoutActionSchema = z.enum(['create', 'update']);

export const importSummarySchema = z.object({
  workoutsToCreate: z.number().int(),
  workoutsToUpdate: z.number().int(),
  exercisesToCreate: z.number().int(),
  sessionsToCreate: z.number().int(),
  sessionsToSkip: z.number().int(),
  setsToCreate: z.number().int(),
});

export const importResultSchema = z.object({
  mode: importModeSchema,
  workouts: z.array(
    z.object({
      name: z.string(),
      action: importWorkoutActionSchema,
      exerciseCount: z.number().int(),
    }),
  ),
  summary: importSummarySchema,
  warnings: z.array(z.string()),
});

/** Ответ preview (план) и commit (фактически выполненное) имеют одинаковую форму. */
export const importPreviewResponseSchema = importResultSchema;
export const importCommitResponseSchema = importResultSchema;

export type ExchangeWorkout = z.infer<typeof exchangeWorkoutSchema>;
export type ExchangeSessionSet = z.infer<typeof exchangeSessionSetSchema>;
export type ExchangeSessionExercise = z.infer<typeof exchangeSessionExerciseSchema>;
export type ExchangeSession = z.infer<typeof exchangeSessionSchema>;
export type ExchangeDocument = z.infer<typeof exchangeDocumentSchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
export type ImportMode = z.infer<typeof importModeSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewInputSchema>;
export type ImportCommitInput = z.infer<typeof importCommitInputSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ImportPreviewResponse = ImportResult;
export type ImportCommitResponse = ImportResult;
