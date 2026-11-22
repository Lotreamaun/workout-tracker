import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@wt/shared';
import type { Db } from '../../db/client';
import { checkHealth } from './service';

export function healthRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    app.withTypeProvider<ZodTypeProvider>().get(
      '/health',
      { schema: { response: { 200: healthResponseSchema } } },
      async () => checkHealth(db),
    );
  };
}
