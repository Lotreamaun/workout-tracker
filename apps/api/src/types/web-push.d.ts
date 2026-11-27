// Минимальные типы для web-push@4 (ESM, без встроенных объявлений).
// Используем только то, что нужно транспорту доставки: шифрование и подпись остаются в библиотеке.
declare module 'web-push' {
  export interface WebPushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  export interface WebPushRequestDetails {
    method: string;
    endpoint: string;
    headers: Record<string, string | number>;
    body: Buffer | null;
  }

  export function generateRequestDetails(
    subscription: WebPushSubscription,
    payload: string | Buffer | null,
    options?: {
      TTL?: number;
      urgency?: string;
      headers?: Record<string, string>;
    },
  ): WebPushRequestDetails;

  export function getVapidHeaders(
    audience: string,
    subject: string,
    publicKey: string,
    privateKey: string,
    contentEncoding: string,
    expiration?: number,
  ): { Authorization: string; 'Crypto-Key'?: string };

  export class WebPushError extends Error {
    constructor(
      message: string,
      statusCode?: number,
      headers?: Record<string, unknown>,
      body?: string,
      endpoint?: string,
    );
    statusCode?: number;
  }
}
