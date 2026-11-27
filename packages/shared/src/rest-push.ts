import { z } from 'zod';

export const REST_PUSH_LIMITS = {
  /** Максимальная длина endpoint-адреса подписки. */
  endpointMaxChars: 2048,
  /** Максимальная длина ключа p256dh (base64url публичного ключа P-256 ≈ 87 символов). */
  p256dhMaxChars: 256,
  /** Максимальная длина ключа auth (base64url 16 байт ≈ 22 символа). */
  authMaxChars: 128,
  /** Максимальный горизонт планирования срока отдыха. */
  endsAtMaxHours: 24,
  /** Максимальная длина строк VAPID-конфигурации. */
  vapidMaxChars: 256,
} as const;

/**
 * Строгая проверка адреса доставки: только HTTPS, хост — поддомен push.apple.com,
 * без userinfo, без явного порта (включая стандартный 443 — реальные адреса подписки
 * порт не содержат) и без управляющих символов. Проверка не зависит от окружения
 * (браузер/Node), поэтому реализована регэкспом, а не глобальным URL.
 */
const APPLE_PUSH_ENDPOINT = /^https:\/\/(?:[A-Za-z0-9-]+\.)+push\.apple\.com\/[!-~]+$/;

/** Доставка Web Push возможна только на HTTPS-адреса поддоменов сервиса Apple Push. */
export function isApplePushEndpoint(value: string): boolean {
  return APPLE_PUSH_ENDPOINT.exec(value)?.[0] === value && !value.includes('#');
}

export const restPushEndpointSchema = z
  .string()
  .min(1)
  .max(REST_PUSH_LIMITS.endpointMaxChars)
  .refine(isApplePushEndpoint, 'Доставка возможна только на HTTPS-адреса сервиса Apple Push');

export const restPushKeysSchema = z.strictObject({
  p256dh: z.string().min(1).max(REST_PUSH_LIMITS.p256dhMaxChars),
  auth: z.string().min(1).max(REST_PUSH_LIMITS.authMaxChars),
});

/** POST /api/rest-push/subscriptions */
export const restPushSubscriptionInputSchema = z.strictObject({
  endpoint: restPushEndpointSchema,
  keys: restPushKeysSchema,
});

export const restPushSubscriptionIdParamsSchema = z.object({ id: z.uuid() });

export const restPushSubscriptionResponseSchema = z.object({
  id: z.uuid(),
});

/** PATCH /api/rest-push/subscriptions/:id/timer — null отменяет срок совпадающей сессии. */
export const restPushTimerInputSchema = z.strictObject({
  sessionId: z.uuid(),
  endsAt: z.iso.datetime().nullable(),
  revision: z
    .number()
    .int()
    .positive()
    .safe(),
});

/** GET /api/rest-push/config — publicKey: null, когда уведомления отключены. */
export const restPushConfigSchema = z.object({
  publicKey: z.string().min(1).nullable(),
});

/** Payload уведомления об окончании отдыха; sessionId — проверенный UUID сессии. */
export const restPushPayloadSchema = z.strictObject({
  type: z.literal('rest-ended'),
  sessionId: z.uuid(),
});

export type RestPushSubscriptionInput = z.infer<typeof restPushSubscriptionInputSchema>;
export type RestPushTimerInput = z.infer<typeof restPushTimerInputSchema>;
export type RestPushConfig = z.infer<typeof restPushConfigSchema>;
export type RestPushPayload = z.infer<typeof restPushPayloadSchema>;
export type RestPushSubscriptionResponse = z.infer<typeof restPushSubscriptionResponseSchema>;
