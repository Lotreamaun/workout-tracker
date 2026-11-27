import { describe, expect, it } from 'vitest';
import { isApplePushEndpoint, restPushTimerInputSchema } from './rest-push';

describe('rest-push: схемы контракта', () => {
  it('isApplePushEndpoint допускает только HTTPS-поддомены push.apple.com без порта и userinfo', () => {
    const valid = [
      'https://web.push.apple.com/1/AABBCC',
      'https://web.push.apple.com/1/AABBCC?token=x',
      'https://api.push.apple.com/v2/push/abc',
    ];
    for (const endpoint of valid) {
      expect(isApplePushEndpoint(endpoint)).toBe(true);
    }

    const invalid = [
      'https://fcm.googleapis.com/fcm/send/abc',
      'http://web.push.apple.com/1/abc',
      'https://web.push.apple.com:8443/1/abc',
      'https://web.push.apple.com:443/1/abc',
      'https://user:pass@web.push.apple.com/1/abc',
      'https://push.apple.com/1/abc',
      'https://evil.test/web.push.apple.com/1/abc',
      'https://evil-push.apple.com.web/abc',
      'https://web.push.apple.com.evil.test/abc',
      'https://web push.apple.com/abc',
      'https://web.push.apple.com/abc\n',
      'https://web.push.apple.com/ab\u0000c',
      'https://web.push.apple.com/abc#fragment',
      'notaurl',
      '',
    ];
    for (const endpoint of invalid) {
      expect(isApplePushEndpoint(endpoint)).toBe(false);
    }
  });

  it('restPushTimerInputSchema принимает UTC ISO 8601 или null и положительную безопасную ревизию', () => {
    const base = { sessionId: '97158d84-5927-4ec0-a9c0-add7c88535fc' };
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00.000Z', revision: 1 }).success).toBe(true);
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00Z', revision: 42 }).success).toBe(true);
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: null, revision: 42 }).success).toBe(true);

    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T12:00:00+02:00', revision: 1 }).success).toBe(false);
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27', revision: 1 }).success).toBe(false);
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00.000Z', revision: 0 }).success).toBe(false);
    expect(restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00.000Z', revision: 1.5 }).success).toBe(false);
    expect(
      restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00.000Z', revision: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false);
    expect(
      restPushTimerInputSchema.safeParse({ ...base, endsAt: '2026-11-27T10:00:00.000Z', revision: 1, extra: 1 }).success,
    ).toBe(false);
  });
});
