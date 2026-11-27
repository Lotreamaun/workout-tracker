import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebPushTransport } from './transport';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ default: { request } }));

function createDelivery() {
  const vapidKey = createECDH('prime256v1');
  vapidKey.generateKeys();
  const recipientKey = createECDH('prime256v1');
  recipientKey.generateKeys();
  return {
    transport: createWebPushTransport({
      publicKey: vapidKey.getPublicKey('base64url'),
      privateKey: vapidKey.getPrivateKey('base64url'),
      subject: 'mailto:tests@example.com',
    }),
    delivery: {
      endpoint: 'https://web.push.apple.com/abc?param=value',
      keys: { p256dh: recipientKey.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') },
      payload: JSON.stringify({ type: 'rest-ended', sessionId: randomUUID() }),
      ttlSeconds: 28,
      urgency: 'high' as const,
    },
  };
}

function simulateReply(statusCode: number, event: 'end' | 'aborted' = 'end') {
  request.mockImplementation((_options: RequestOptions, respond: (value: EventEmitter) => void) => {
    const response = Object.assign(new EventEmitter(), {
      statusCode,
      resume: () => response.emit(event),
    });
    return Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: () => respond(response),
    });
  });
}

beforeEach(() => request.mockReset());

describe('Транспорт Web Push', () => {
  it('отправляет зашифрованный push и повторно использует JWT для origin', async () => {
    simulateReply(201);
    const { transport, delivery } = createDelivery();

    await transport(delivery);
    await transport(delivery);

    const first = request.mock.calls[0]![0] as RequestOptions;
    const second = request.mock.calls[1]![0] as RequestOptions;
    expect(first).toMatchObject({
      hostname: 'web.push.apple.com',
      path: '/abc?param=value',
      method: 'POST',
      signal: expect.any(AbortSignal),
      headers: { 'Content-Encoding': 'aes128gcm', TTL: 28, Urgency: 'high' },
    });
    expect(first.headers).toHaveProperty('Authorization', expect.stringMatching(/^vapid t=.+, k=.+$/));
    expect(second.headers).toHaveProperty('Authorization', (first.headers as Record<string, string>).Authorization);
  });

  it('возвращает статус 3xx без повторного запроса', async () => {
    simulateReply(302);
    const { transport, delivery } = createDelivery();

    await expect(transport(delivery)).rejects.toMatchObject({ statusCode: 302 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('возвращает ошибку при обрыве ответа', async () => {
    simulateReply(201, 'aborted');
    const { transport, delivery } = createDelivery();

    await expect(transport(delivery)).rejects.toThrow('Ответ сервиса push прерван');
  });
});
