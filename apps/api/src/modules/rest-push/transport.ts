import https from 'node:https';
import {
  generateRequestDetails,
  getVapidHeaders,
  WebPushError,
  type WebPushRequestDetails,
  type WebPushSubscription,
} from 'web-push';
import { REST_PUSH_SEND_TIMEOUT_MS, type RestPushDelivery, type RestPushTransport } from './worker';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Apple требует не обновлять JWT VAPID чаще раза в час для того же origin. */
const VAPID_JWT_REUSE_MS = 60 * 60 * 1000;
const AES_128_GCM = 'aes128gcm';

/**
 * Транспорт доставки через web-push: шифрование (aes128gcm) и подпись JWT выполняет библиотека.
 * Библиотека подписывает новый JWT на каждый вызов, поэтому заголовок Authorization кэшируется
 * по origin сервиса на час и переиспользуется, как требует Apple. Переходы по перенаправлениям
 * невозможны: запрос отправляется напрямую через node:https без следования за 3xx.
 */
export function createWebPushTransport(vapid: VapidConfig): RestPushTransport {
  const authCache = new Map<string, { authorization: string; createdAtMs: number }>();

  return async (delivery: RestPushDelivery) => {
    const subscription: WebPushSubscription = { endpoint: delivery.endpoint, keys: delivery.keys };
    const details = generateRequestDetails(subscription, delivery.payload, {
      TTL: delivery.ttlSeconds,
      urgency: delivery.urgency,
    });

    const audience = new URL(delivery.endpoint).origin;
    let cached = authCache.get(audience);
    if (!cached || Date.now() - cached.createdAtMs >= VAPID_JWT_REUSE_MS) {
      const headers = getVapidHeaders(audience, vapid.subject, vapid.publicKey, vapid.privateKey, AES_128_GCM);
      cached = { authorization: headers.Authorization, createdAtMs: Date.now() };
      authCache.set(audience, cached);
    }
    details.headers.Authorization = cached.authorization;

    await requestDelivery(details);
  };
}

function requestDelivery(details: WebPushRequestDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(details.endpoint);
    const request = https.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: details.method,
        headers: details.headers,
        signal: AbortSignal.timeout(REST_PUSH_SEND_TIMEOUT_MS),
      },
      (response) => {
        response.on('aborted', () => reject(new Error('Ответ сервиса push прерван')));
        response.on('error', reject);
        response.on('end', () => {
          const { statusCode } = response;
          if (statusCode !== undefined && statusCode >= 200 && statusCode < 300) {
            resolve();
          } else {
            // endpoint не попадает в сообщение ошибки и не логируется.
            reject(new WebPushError('Сервис push отклонил запрос', statusCode));
          }
        });
        response.resume();
      },
    );
    request.on('error', reject);
    if (details.body) request.write(details.body);
    request.end();
  });
}
