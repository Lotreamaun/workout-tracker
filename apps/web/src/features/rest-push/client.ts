import { z } from 'zod';
import { apiRequest, jsonBody } from '@/lib/api';
import {
  restPushConfigSchema,
  restPushSubscriptionResponseSchema,
  type RestPushConfig,
  type RestPushSubscriptionInput,
  type RestPushSubscriptionResponse,
  type RestPushTimerInput,
} from '@wt/shared';

/** Клиент контракта уведомлений об отдыхе (см. design.md, раздел API). */
export const restPushApi = {
  getConfig: (): Promise<RestPushConfig> => apiRequest('/api/rest-push/config', restPushConfigSchema),
  createSubscription: (input: RestPushSubscriptionInput): Promise<RestPushSubscriptionResponse> =>
    apiRequest('/api/rest-push/subscriptions', restPushSubscriptionResponseSchema, jsonBody('POST', input)),
  // 204 без тела: apiRequest отдаёт undefined.
  updateTimer: async (subscriptionId: string, input: RestPushTimerInput): Promise<undefined> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      return await apiRequest(
        `/api/rest-push/subscriptions/${encodeURIComponent(subscriptionId)}/timer`,
        z.undefined(),
        { ...jsonBody('PATCH', input), signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }
  },
  // DELETE без тела и без Content-Type: Fastify отклоняет пустое тело при application/json.
  deleteSubscription: (subscriptionId: string): Promise<undefined> =>
    apiRequest(`/api/rest-push/subscriptions/${encodeURIComponent(subscriptionId)}`, z.undefined(), {
      method: 'DELETE',
    }),
};
