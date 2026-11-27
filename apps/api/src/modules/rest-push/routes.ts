import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  restPushConfigSchema,
  restPushSubscriptionIdParamsSchema,
  restPushSubscriptionInputSchema,
  restPushSubscriptionResponseSchema,
  restPushTimerInputSchema,
} from '@wt/shared';
import type { Db } from '../../db/client';
import {
  deleteSubscription,
  getRestPushConfig,
  registerSubscription,
  updateSubscriptionTimer,
  type RestPushAvailability,
} from './service';

export function restPushRoutes(db: Db, availability: RestPushAvailability) {
  return async (app: FastifyInstance) => {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/rest-push/config',
      { schema: { response: { 200: restPushConfigSchema } } },
      async () => getRestPushConfig(availability),
    );

    typed.post(
      '/rest-push/subscriptions',
      { schema: { body: restPushSubscriptionInputSchema, response: { 200: restPushSubscriptionResponseSchema } } },
      async (request) => registerSubscription(db, availability, request.body),
    );

    typed.patch(
      '/rest-push/subscriptions/:id/timer',
      { schema: { params: restPushSubscriptionIdParamsSchema, body: restPushTimerInputSchema } },
      async (request, reply) => {
        updateSubscriptionTimer(db, availability, request.params.id, request.body);
        return reply.status(204).send();
      },
    );

    typed.delete('/rest-push/subscriptions/:id', { schema: { params: restPushSubscriptionIdParamsSchema } }, async (
      request,
      reply,
    ) => {
      deleteSubscription(db, availability, request.params.id);
      return reply.status(204).send();
    });
  };
}
