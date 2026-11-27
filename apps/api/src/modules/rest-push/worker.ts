import type { FastifyBaseLogger } from 'fastify';
import type { RestPushPayload } from '@wt/shared';
import type { Db } from '../../db/client';
import * as repo from './repository';

/** Задача истекает через 30 секунд от срока — позже уведомление уже не имеет смысла. */
export const REST_PUSH_JOB_TTL_SECONDS = 30;
/** Короткий таймаут исходящего запроса доставки. */
export const REST_PUSH_SEND_TIMEOUT_MS = 5_000;
/** Интервал цикла отправки; запускается только при включённой конфигурации. */
export const REST_PUSH_DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface RestPushDelivery {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** JSON-payload уведомления: только { type: 'rest-ended', sessionId }. */
  payload: string;
  /** Оставшееся время жизни задачи в секундах (до истечения TTL от срока). */
  ttlSeconds: number;
  urgency: 'high';
}

/** Доставка уведомления; в тестах заменяется подставной функцией. */
export type RestPushTransport = (delivery: RestPushDelivery) => Promise<void>;

/**
 * Цикл доставки Web Push. Берёт нехваченные сроки по мере наступления; захват срока — граница,
 * после которой отмена уже не действует. Один запуск цикла не пересекается с другим: все
 * отправки выполняются под одним промисом. При закрытии прекращает брать задачи и дожидается
 * текущей отправки до закрытия SQLite.
 */
export class RestPushWorker {
  private stopped = false;
  private tickTimer: NodeJS.Timeout | undefined;
  private inflight: Promise<void> | undefined;

  constructor(
    private readonly db: Db,
    private readonly transport: RestPushTransport,
    private readonly pollIntervalMs: number = REST_PUSH_DEFAULT_POLL_INTERVAL_MS,
    private readonly log: FastifyBaseLogger,
  ) {}

  start() {
    this.schedule();
  }

  /** Прекращает брать новые задачи и дожидается текущей отправки. */
  async stop() {
    this.stopped = true;
    clearTimeout(this.tickTimer);
    this.tickTimer = undefined;
    await this.inflight?.catch(() => {});
  }

  private schedule() {
    if (this.stopped) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = undefined;
      void this.tick();
    }, this.pollIntervalMs);
  }

  private async tick() {
    this.inflight = this.processDue();
    try {
      await this.inflight;
    } catch (error) {
      // Логируем тип ошибки без значений из запроса или базы.
      this.log.warn({ errorType: error instanceof Error ? error.name : typeof error }, 'Цикл доставки Web Push прерван');
    } finally {
      this.inflight = undefined;
    }
    this.schedule();
  }

  private async processDue() {
    while (!this.stopped) {
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const due = repo.findNextDueSubscription(this.db, nowIso);
      if (!due) return;

      // Атомарный захват: одновременно сверяем актуальность срока и статус сессии.
      const capturedAt = nowIso;
      const expirationCutoff = new Date(now - REST_PUSH_JOB_TTL_SECONDS * 1000).toISOString();
      const captured = repo.tryCaptureTimer(this.db, due, capturedAt, expirationCutoff);
      if (!captured) continue;

      const deadlineMs = Date.parse(captured.timerEndsAt) + REST_PUSH_JOB_TTL_SECONDS * 1000;
      const ttlSeconds = Math.ceil((deadlineMs - Date.now()) / 1000);
      const capture = { endsAt: captured.timerEndsAt, capturedAt };
      if (ttlSeconds <= 0) {
        repo.abandonTimerSend(this.db, captured.id, capture, new Date().toISOString());
        continue;
      }
      const payload: RestPushPayload = { type: 'rest-ended', sessionId: captured.timerSessionId };
      try {
        await this.transport({
          endpoint: captured.endpoint,
          keys: { p256dh: captured.p256dh, auth: captured.auth },
          payload: JSON.stringify(payload),
          ttlSeconds,
          urgency: 'high',
        });
      } catch (error) {
        const statusCode = (error as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Подписка истекла: убираем её целиком, не трогая возможные новые подписки.
          if (repo.deleteExpiredSubscription(this.db, captured)) {
            this.log.info({ subscriptionId: captured.id, statusCode }, 'Подписка Web Push удалена по ответу сервиса');
          }
        } else {
          // Сбой сети/процесса может потерять одну отправку: захваченный срок не возвращаем в расписание.
          this.log.warn({ subscriptionId: captured.id, statusCode }, 'Доставка Web Push не удалась');
        }
        repo.abandonTimerSend(this.db, captured.id, capture, new Date().toISOString());
        continue;
      }
      repo.completeTimerSend(this.db, captured.id, capture, new Date().toISOString());
    }
  }
}
