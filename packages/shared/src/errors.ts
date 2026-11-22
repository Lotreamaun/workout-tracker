import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  WORKOUT_ARCHIVED: 'WORKOUT_ARCHIVED',
  WORKOUT_EMPTY: 'WORKOUT_EMPTY',
  SESSION_IN_PROGRESS: 'SESSION_IN_PROGRESS',
  SESSION_NOT_EDITABLE: 'SESSION_NOT_EDITABLE',
  SESSION_NOT_IN_PROGRESS: 'SESSION_NOT_IN_PROGRESS',
  UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
