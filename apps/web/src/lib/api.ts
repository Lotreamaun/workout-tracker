import {
  apiErrorSchema,
  deleteWorkoutResultSchema,
  exchangeDocumentSchema,
  exerciseListSchema,
  exerciseSchema,
  healthResponseSchema,
  importCommitResponseSchema,
  importPreviewResponseSchema,
  sessionListSchema,
  sessionSchema,
  workoutListSchema,
  workoutSchema,
  type DeleteWorkoutResult,
  type ExchangeDocument,
  type Exercise,
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
import { z, type ZodType } from 'zod';
import { getAccessKey, notifyAccessKeyRequired } from './accessKey';

// В продакшене api раздаёт и фронтенд, поэтому запросы идут на тот же origin.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : `${window.location.protocol}//${window.location.hostname}:3000`)
).replace(/\/$/, '');

/** Адрес медиа-файла: пути `/media/...` в dev живут на порту api. */
export function mediaSrc(path: string): string {
  return `${API_BASE_URL}${path}`;
}

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
  const headers = new Headers(init?.headers);
  const accessKey = getAccessKey();
  if (accessKey) headers.set('Authorization', `Bearer ${accessKey}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Сервер недоступен');
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      if (response.status === 401 && code === 'UNAUTHORIZED') notifyAccessKeyRequired();
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
  listExercises: (): Promise<Exercise[]> => apiRequest('/api/exercises', exerciseListSchema),
  getExercise: (id: string): Promise<Exercise> => apiRequest(`/api/exercises/${encodeURIComponent(id)}`, exerciseSchema),
  // 204 без тела: apiRequest отдаёт undefined.
  deleteExercise: (id: string): Promise<undefined> =>
    apiRequest(`/api/exercises/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' }),
  // Без Content-Type: браузер сам выставит multipart с boundary.
  uploadExerciseMedia: (id: string, form: FormData): Promise<Exercise> =>
    apiRequest(`/api/exercises/${encodeURIComponent(id)}/media`, exerciseSchema, { method: 'POST', body: form }),
  deleteExerciseMedia: (id: string, mediaId: string): Promise<Exercise> =>
    apiRequest(
      `/api/exercises/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`,
      exerciseSchema,
      { method: 'DELETE' },
    ),
  exportData: (includeSessions: boolean): Promise<ExchangeDocument> =>
    apiRequest(`/api/export?includeSessions=${includeSessions}`, exchangeDocumentSchema),
  previewImport: (input: ImportPreviewInput): Promise<ImportPreviewResponse> =>
    apiRequest('/api/import/preview', importPreviewResponseSchema, jsonBody('POST', input)),
  commitImport: (input: ImportCommitInput): Promise<ImportCommitResponse> =>
    apiRequest('/api/import/commit', importCommitResponseSchema, jsonBody('POST', input)),
};
