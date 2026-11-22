import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('принимает ok и ISO-время в UTC', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', time: new Date().toISOString() }).success).toBe(true);
  });

  it('отклоняет неверный статус', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', time: new Date().toISOString() }).success).toBe(false);
  });
});
