import type { RestPushConfig, RestPushSubscriptionInput, RestPushTimerInput } from '@wt/shared';
import { ERROR_CODES, REST_PUSH_LIMITS } from '@wt/shared';
import type { Db } from '../../db/client';
import { AppError } from '../../plugins/errors';
import { findSession } from '../sessions/repository';
import * as repo from './repository';

/** Доступность Web Push: включён только при конфигурации VAPID и действующей защите API. */
export interface RestPushAvailability {
  enabled: boolean;
  publicKey: string | null;
}

function disabled(): never {
  throw new AppError(ERROR_CODES.PUSH_DISABLED, 503, 'Уведомления об отдыхе отключены на сервере');
}

function notFoundSubscription(): never {
  throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Подписка не найдена');
}

function validationError(path: string, message: string): never {
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, message, [{ path, message }]);
}

export function getRestPushConfig(availability: RestPushAvailability): RestPushConfig {
  return { publicKey: availability.enabled ? availability.publicKey : null };
}

/** POST /api/rest-push/subscriptions — повторный POST того же endpoint обновляет ключи и возвращает прежний ID. */
export function registerSubscription(
  db: Db,
  availability: RestPushAvailability,
  input: RestPushSubscriptionInput,
): { id: string } {
  if (!availability.enabled) disabled();
  return db.transaction((tx) => {
    const now = new Date().toISOString();
    const existing = repo.findSubscriptionByEndpoint(tx, input.endpoint);
    if (existing) {
      repo.updateSubscriptionKeys(tx, existing.id, input.keys, now);
      return { id: existing.id };
    }
    const id = crypto.randomUUID();
    repo.insertSubscription(tx, {
      id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  });
}

/** Ненулевой срок — UTC ISO 8601 в будущем и не дальше 24 часов. */
function assertFutureEndsAt(endsAtIso: string) {
  const endsAtMs = Date.parse(endsAtIso);
  const nowMs = Date.now();
  if (Number.isNaN(endsAtMs) || endsAtMs <= nowMs) {
    validationError('endsAt', 'Срок окончания должен быть в будущем');
  }
  if (endsAtMs - nowMs > REST_PUSH_LIMITS.endsAtMaxHours * 3_600_000) {
    validationError('endsAt', `Срок окончания не дальше ${REST_PUSH_LIMITS.endsAtMaxHours} часов`);
  }
}

/**
 * PATCH /api/rest-push/subscriptions/:id/timer.
 * Запросы упорядочиваются по ревизии: повтор и более ранняя ревизия ничего не меняют.
 * Отмена (endsAt: null) применяется только к совпадающей сессии; захваченный на отправку срок не отменяется.
 */
export function updateSubscriptionTimer(
  db: Db,
  availability: RestPushAvailability,
  subscriptionId: string,
  input: RestPushTimerInput,
): void {
  if (!availability.enabled) disabled();
  db.transaction((tx) => {
    const row = repo.findSubscriptionById(tx, subscriptionId);
    if (!row) notFoundSubscription();
    if (input.revision <= row.lastRevision) return;

    const now = new Date().toISOString();
    if (input.endsAt === null) {
      if (row.timerEndsAt && row.timerSessionId === input.sessionId && !row.timerCapturedAt) {
        repo.clearTimer(tx, subscriptionId, input.revision, now);
      } else {
        repo.touchRevision(tx, subscriptionId, input.revision, now);
      }
      return;
    }

    // Канонический UTC с миллисекундами: лексикографический порядок строк совпадает с хронологическим.
    const endsAt = new Date(input.endsAt).toISOString();
    // Повтор уже отправленного срока не создаёт повторную отправку.
    if (endsAt === row.lastSentEndsAt) {
      repo.touchRevision(tx, subscriptionId, input.revision, now);
      return;
    }
    assertFutureEndsAt(endsAt);
    const session = findSession(tx, input.sessionId);
    if (!session) throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Сессия не найдена');
    if (session.status !== 'in_progress') {
      throw new AppError(ERROR_CODES.SESSION_NOT_IN_PROGRESS, 409, 'Срок можно ставить только активной тренировке');
    }
    repo.scheduleTimer(tx, subscriptionId, { sessionId: input.sessionId, endsAt, revision: input.revision }, now);
  });
}

/** DELETE /api/rest-push/subscriptions/:id — 204, в том числе при повторе. */
export function deleteSubscription(db: Db, availability: RestPushAvailability, id: string): void {
  if (!availability.enabled) disabled();
  repo.deleteSubscriptionRow(db, id);
}
