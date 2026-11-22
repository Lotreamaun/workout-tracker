import {
  ERROR_CODES,
  EXCHANGE_SCHEMA_VERSION,
  exchangeDocumentSchema,
  type ExchangeDocument,
  type ImportCommitInput,
  type ImportPreviewInput,
  type ImportResult,
} from '@wt/shared';
import type { Db } from '../../db/client';
import { AppError } from '../../plugins/errors';
import * as sessionRepo from '../sessions/repository';
import * as workoutRepo from '../workouts/repository';
import { syncWorkoutExercises } from '../workouts/service';
import { buildExport } from './export';
import { planImport, summarizePlan, type ImportPlan } from './plan';
import * as repo from './repository';

const MAX_ERROR_DETAILS = 100;

function validationError(details: unknown[]): never {
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, 'Документ обмена не прошёл проверку', details);
}

/**
 * Проверяет `data`: сначала schemaVersion (UNSUPPORTED_SCHEMA_VERSION отдаётся раньше полной схемы),
 * затем вся схема. Пути ошибок — через точку с префиксом `data.`.
 */
export function parseExchangeDocument(data: unknown): ExchangeDocument {
  if (data === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) {
    validationError([{ path: 'data', message: 'Ожидается объект документа обмена', keyword: 'invalid_type' }]);
  }
  if (!('schemaVersion' in data) || (data as { schemaVersion?: unknown }).schemaVersion === undefined) {
    validationError([{ path: 'data.schemaVersion', message: 'Обязательное поле', keyword: 'required' }]);
  }
  const { schemaVersion } = data as { schemaVersion: unknown };
  if (schemaVersion !== EXCHANGE_SCHEMA_VERSION) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
      400,
      `Неподдерживаемая версия формата: поддерживается schemaVersion ${EXCHANGE_SCHEMA_VERSION}`,
      { schemaVersion, supported: [EXCHANGE_SCHEMA_VERSION] },
    );
  }

  const parsed = exchangeDocumentSchema.safeParse(data);
  if (parsed.success) return parsed.data;

  const details: { path: string; message: string; keyword: string }[] = [];
  for (const issue of parsed.error.issues) {
    const base = ['data', ...issue.path.map(String)];
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        details.push({ path: [...base, key].join('.'), message: 'Неизвестное поле', keyword: issue.code });
      }
    } else {
      details.push({ path: base.join('.'), message: issue.message, keyword: issue.code });
    }
  }
  return validationError(details.slice(0, MAX_ERROR_DETAILS));
}

export function exportData(db: Db, includeSessions: boolean): ExchangeDocument {
  return buildExport(db, includeSessions);
}

export function previewImport(db: Db, input: ImportPreviewInput): ImportResult {
  const doc = parseExchangeDocument(input.data);
  return summarizePlan(planImport(db, doc, input.mode));
}

function executePlan(tx: repo.DbOrTx, plan: ImportPlan) {
  const now = new Date().toISOString();

  for (const workout of plan.workouts) {
    if (workout.action === 'create') {
      workoutRepo.insertWorkout(tx, {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      workout.exercises.forEach(({ id, input }, position) => {
        workoutRepo.insertExercise(tx, {
          id,
          workoutId: workout.id,
          name: input.name,
          description: input.description === undefined || input.description === '' ? null : input.description,
          position,
          plannedSets: input.plannedSets,
          plannedReps: input.plannedReps ?? null,
          plannedWeight: input.plannedWeight ?? null,
          restSeconds: input.restSeconds ?? null,
          notes: input.notes === undefined || input.notes === '' ? null : input.notes,
          createdAt: now,
          updatedAt: now,
        });
      });
    } else {
      const patch: Partial<workoutRepo.WorkoutRow> = { name: workout.name, updatedAt: now };
      if (workout.description !== undefined) patch.description = workout.description;
      workoutRepo.updateWorkoutRow(tx, workout.id, patch);
      syncWorkoutExercises(tx, workout.id, workout.exercises, now);
    }
  }

  for (const session of plan.sessions) {
    sessionRepo.insertSession(tx, {
      id: session.id,
      workoutId: session.workoutId,
      workoutNameSnapshot: session.workoutNameSnapshot,
      status: 'completed',
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      notes: session.notes,
    });
    repo.insertSetLogsChunked(tx, session.setLogs);
  }
}

/** План строится заново внутри транзакции; любая ошибка откатывает весь импорт. */
export function commitImport(db: Db, input: ImportCommitInput): ImportResult {
  const doc = parseExchangeDocument(input.data);
  if (input.mode === 'replace' && input.confirmReplace !== true) {
    throw new AppError(
      ERROR_CODES.CONFIRMATION_REQUIRED,
      400,
      'Режим замены требует подтверждения (confirmReplace: true)',
    );
  }

  return db.transaction((tx) => {
    const plan = planImport(tx, doc, input.mode);
    executePlan(tx, plan);
    return summarizePlan(plan);
  });
}
