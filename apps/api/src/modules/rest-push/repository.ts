import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { restPushSubscriptions, workoutSessions } from '../../db/schema';
import type { DbOrTx } from '../workouts/repository';

export type { DbOrTx };
export type RestPushSubscriptionRow = typeof restPushSubscriptions.$inferSelect;
export type RestPushSubscriptionInsert = typeof restPushSubscriptions.$inferInsert;

export function findSubscriptionById(db: DbOrTx, id: string): RestPushSubscriptionRow | undefined {
  return db.select().from(restPushSubscriptions).where(eq(restPushSubscriptions.id, id)).get();
}

export function findSubscriptionByEndpoint(db: DbOrTx, endpoint: string): RestPushSubscriptionRow | undefined {
  return db.select().from(restPushSubscriptions).where(eq(restPushSubscriptions.endpoint, endpoint)).get();
}

export function insertSubscription(db: DbOrTx, row: RestPushSubscriptionInsert) {
  db.insert(restPushSubscriptions).values(row).run();
}

export function updateSubscriptionKeys(db: DbOrTx, id: string, keys: { p256dh: string; auth: string }, updatedAt: string) {
  db.update(restPushSubscriptions).set({ ...keys, updatedAt }).where(eq(restPushSubscriptions.id, id)).run();
}

/** Идемпотентное удаление: отсутствие строки — не ошибка. */
export function deleteSubscriptionRow(db: DbOrTx, id: string) {
  db.delete(restPushSubscriptions).where(eq(restPushSubscriptions.id, id)).run();
}

export function deleteExpiredSubscription(db: DbOrTx, sent: RestPushSubscriptionRow): boolean {
  return db.delete(restPushSubscriptions).where(and(
    eq(restPushSubscriptions.id, sent.id),
    eq(restPushSubscriptions.p256dh, sent.p256dh),
    eq(restPushSubscriptions.auth, sent.auth),
  )).run().changes > 0;
}

/** Планирует срок: заменяет любой прежний, захват сбрасывается (отправки по нему ещё не было). */
export function scheduleTimer(
  db: DbOrTx,
  id: string,
  timer: { sessionId: string; endsAt: string; revision: number },
  updatedAt: string,
) {
  db.update(restPushSubscriptions)
    .set({
      timerSessionId: timer.sessionId,
      timerEndsAt: timer.endsAt,
      timerCapturedAt: null,
      lastRevision: timer.revision,
      updatedAt,
    })
    .where(eq(restPushSubscriptions.id, id))
    .run();
}

/** Отмена: убирает срок, если он не захвачен под текущую отправку. */
export function clearTimer(db: DbOrTx, id: string, revision: number, updatedAt: string) {
  db.update(restPushSubscriptions)
    .set({ timerSessionId: null, timerEndsAt: null, timerCapturedAt: null, lastRevision: revision, updatedAt })
    .where(and(eq(restPushSubscriptions.id, id), isNull(restPushSubscriptions.timerCapturedAt)))
    .run();
}

/** Обновляет только ревизию (запрос принят, но состояние таймера не изменилось). */
export function touchRevision(db: DbOrTx, id: string, revision: number, updatedAt: string) {
  db.update(restPushSubscriptions).set({ lastRevision: revision, updatedAt }).where(eq(restPushSubscriptions.id, id)).run();
}

/** Самый ранний нехваченный срок, который уже наступил. */
export function findNextDueSubscription(db: DbOrTx, nowIso: string): RestPushSubscriptionRow | undefined {
  return db
    .select()
    .from(restPushSubscriptions)
    .where(and(
      isNull(restPushSubscriptions.timerCapturedAt),
      isNotNull(restPushSubscriptions.timerSessionId),
      lte(restPushSubscriptions.timerEndsAt, nowIso),
    ))
    .orderBy(asc(restPushSubscriptions.timerEndsAt))
    .get();
}

/** Захват срока для немедленной отправки: атомарно проверяет, что срок ещё актуален. */
export function tryCaptureTimer(db: Db, due: RestPushSubscriptionRow, nowIso: string, expirationCutoff: string) {
  return db.transaction((tx) => {
    const row = findSubscriptionById(tx, due.id);
    if (!row?.timerEndsAt || !row.timerSessionId || row.timerCapturedAt ||
      row.lastRevision !== due.lastRevision || row.timerEndsAt !== due.timerEndsAt || row.timerEndsAt > nowIso) {
      return null;
    }
    // Просроченный или уже отправленный Push не отправляется.
    if (row.timerEndsAt <= expirationCutoff || row.timerEndsAt === row.lastSentEndsAt) {
      clearTimer(tx, row.id, row.lastRevision, nowIso);
      return null;
    }
    // Завершённая или отменённая сессия отменяет будущую отправку.
    const session = tx.select().from(workoutSessions).where(eq(workoutSessions.id, row.timerSessionId)).get();
    if (!session || session.status !== 'in_progress') {
      clearTimer(tx, row.id, row.lastRevision, nowIso);
      return null;
    }
    const claim = tx.update(restPushSubscriptions)
      .set({ timerCapturedAt: nowIso })
      .where(eq(restPushSubscriptions.id, row.id))
      .run();
    if (claim.changes !== 1) return null;
    return { ...row, timerEndsAt: row.timerEndsAt, timerSessionId: row.timerSessionId };
  }, { behavior: 'immediate' });
}

/**
 * Завершение отправки: фиксирует отправленный срок и убирает его из расписания.
 * Если срок за время отправки заменили (продление/новый отдых), новый срок не трогаем —
 * обновляется только отметка об отправке прежнего.
 */
export function completeTimerSend(db: DbOrTx, id: string, sent: { endsAt: string; capturedAt: string }, nowIso: string) {
  const cleared = db
    .update(restPushSubscriptions)
    .set({
      timerSessionId: null,
      timerEndsAt: null,
      timerCapturedAt: null,
      lastSentEndsAt: sent.endsAt,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(restPushSubscriptions.id, id),
        eq(restPushSubscriptions.timerEndsAt, sent.endsAt),
        eq(restPushSubscriptions.timerCapturedAt, sent.capturedAt),
      ),
    )
    .run().changes;
  if (cleared === 0) {
    db.update(restPushSubscriptions)
      .set({ lastSentEndsAt: sent.endsAt, updatedAt: nowIso })
      .where(eq(restPushSubscriptions.id, id))
      .run();
  }
}

/**
 * Неудачная отправка: убирает захваченный срок без пометки об отправке,
 * чтобы повторно заданный тот же срок мог быть доставлен ещё раз.
 */
export function abandonTimerSend(db: DbOrTx, id: string, sent: { endsAt: string; capturedAt: string }, nowIso: string) {
  db.update(restPushSubscriptions)
    .set({ timerSessionId: null, timerEndsAt: null, timerCapturedAt: null, updatedAt: nowIso })
    .where(
      and(
        eq(restPushSubscriptions.id, id),
        eq(restPushSubscriptions.timerEndsAt, sent.endsAt),
        eq(restPushSubscriptions.timerCapturedAt, sent.capturedAt),
      ),
    )
    .run();
}
