import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  sessionCompleteInputSchema,
  sessionIdParamsSchema,
  sessionListQuerySchema,
  sessionListSchema,
  sessionPatchInputSchema,
  sessionSchema,
  workoutIdParamsSchema,
} from '@wt/shared';
import type { Db } from '../../db/client';
import { completeSession, getSession, listSessions, patchSession, startSession } from './service';

export function sessionRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.post(
      '/workouts/:id/sessions',
      { schema: { params: workoutIdParamsSchema, response: { 201: sessionSchema } } },
      async (request, reply) => reply.status(201).send(startSession(db, request.params.id)),
    );

    typed.get(
      '/sessions',
      { schema: { querystring: sessionListQuerySchema, response: { 200: sessionListSchema } } },
      async (request) => listSessions(db, request.query),
    );

    typed.get(
      '/sessions/:id',
      { schema: { params: sessionIdParamsSchema, response: { 200: sessionSchema } } },
      async (request) => getSession(db, request.params.id),
    );

    typed.patch(
      '/sessions/:id',
      {
        schema: { params: sessionIdParamsSchema, body: sessionPatchInputSchema, response: { 200: sessionSchema } },
      },
      async (request) => patchSession(db, request.params.id, request.body),
    );

    typed.post(
      '/sessions/:id/complete',
      {
        schema: {
          params: sessionIdParamsSchema,
          body: sessionCompleteInputSchema.nullish(),
          response: { 200: sessionSchema },
        },
      },
      async (request) => completeSession(db, request.params.id, request.body),
    );
  };
}
