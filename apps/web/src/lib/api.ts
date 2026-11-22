import {
  apiErrorSchema,
  deleteWorkoutResultSchema,
  exchangeDocumentSchema,
  healthResponseSchema,
  importCommitResponseSchema,
  importPreviewResponseSchema,
  sessionListSchema,
  sessionSchema,
  workoutListSchema,
  workoutSchema,
  type DeleteWorkoutResult,
  type ExchangeDocument,
  type HealthResponse,
  type ImportCommitInput,
  type ImportCommitResponse,
  type ImportPreviewInput,
  type ImportPreviewResponse,
  type Session,
  type SessionCompleteInput,
  type SessionListItem,
  type SessionPatchInput,
  type SessionStatus,
  type Workout,
  type WorkoutCreateInput,
  type WorkoutListItem,
  type WorkoutUpdateInput,
} from '@wt/shared';
import type { ZodType } from 'zod';

// В продакшене api раздаёт и фронтенд, поэтому запросы идут на тот же origin.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : `${window.location.protocol}//${window.location.hostname}:3000`)
).replace(/\/$/, '');

export type ApiErrorKind = 'network' | 'http';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.kind === 'network';
  }
}

export async function apiRequest<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError('network', 'Сервер недоступен');
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError('http', message, response.status, code, details);
    }
    throw new ApiError('http', `Ошибка сервера (${response.status})`, response.status);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('http', 'Сервер вернул неожиданный ответ', response.status);
  }
  return parsed.data;
}

function jsonBody(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const api = {
  health: (): Promise<HealthResponse> => apiRequest('/api/health', healthResponseSchema),
  listWorkouts: (): Promise<WorkoutListItem[]> => apiRequest('/api/workouts', workoutListSchema),
  getWorkout: (id: string): Promise<Workout> => apiRequest(`/api/workouts/${encodeURIComponent(id)}`, workoutSchema),
  createWorkout: (input: WorkoutCreateInput): Promise<Workout> =>
    apiRequest('/api/workouts', workoutSchema, jsonBody('POST', input)),
  updateWorkout: (id: string, input: WorkoutUpdateInput): Promise<Workout> =>
    apiRequest(`/api/workouts/${encodeURIComponent(id)}`, workoutSchema, jsonBody('PATCH', input)),
  // DELETE без тела и без Content-Type: Fastify отклоняет пустое тело при application/json.
  deleteWorkout: (id: string): Promise<DeleteWorkoutResult> =>
    apiRequest(`/api/workouts/${encodeURIComponent(id)}`, deleteWorkoutResultSchema, { method: 'DELETE' }),
  // POST без тела и без Content-Type: Fastify отклоняет пустое тело при application/json.
  startSession: (workoutId: string): Promise<Session> =>
    apiRequest(`/api/workouts/${encodeURIComponent(workoutId)}/sessions`, sessionSchema, { method: 'POST' }),
  listSessions: (status: SessionStatus, limit: number): Promise<SessionListItem[]> =>
    apiRequest(`/api/sessions?status=${status}&limit=${limit}`, sessionListSchema),
  getSession: (id: string): Promise<Session> => apiRequest(`/api/sessions/${encodeURIComponent(id)}`, sessionSchema),
  patchSession: (id: string, input: SessionPatchInput): Promise<Session> =>
    apiRequest(`/api/sessions/${encodeURIComponent(id)}`, sessionSchema, jsonBody('PATCH', input)),
  completeSession: (id: string, input: SessionCompleteInput = {}): Promise<Session> =>
    apiRequest(`/api/sessions/${encodeURIComponent(id)}/complete`, sessionSchema, jsonBody('POST', input)),
  exportData: (includeSessions: boolean): Promise<ExchangeDocument> =>
    apiRequest(`/api/export?includeSessions=${includeSessions}`, exchangeDocumentSchema),
  previewImport: (input: ImportPreviewInput): Promise<ImportPreviewResponse> =>
    apiRequest('/api/import/preview', importPreviewResponseSchema, jsonBody('POST', input)),
  commitImport: (input: ImportCommitInput): Promise<ImportCommitResponse> =>
    apiRequest('/api/import/commit', importCommitResponseSchema, jsonBody('POST', input)),
};
