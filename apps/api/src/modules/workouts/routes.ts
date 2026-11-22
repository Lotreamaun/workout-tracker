import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  deleteWorkoutResultSchema,
  workoutCreateInputSchema,
  workoutIdParamsSchema,
  workoutListSchema,
  workoutSchema,
  workoutUpdateInputSchema,
} from '@wt/shared';
import type { Db } from '../../db/client';
import { createWorkout, deleteWorkout, getWorkout, listWorkouts, updateWorkout } from './service';

export function workoutRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get('/workouts', { schema: { response: { 200: workoutListSchema } } }, async () => listWorkouts(db));

    typed.post(
      '/workouts',
      { schema: { body: workoutCreateInputSchema, response: { 201: workoutSchema } } },
      async (request, reply) => reply.status(201).send(createWorkout(db, request.body)),
    );

    typed.get(
      '/workouts/:id',
      { schema: { params: workoutIdParamsSchema, response: { 200: workoutSchema } } },
      async (request) => getWorkout(db, request.params.id),
    );

    typed.patch(
      '/workouts/:id',
      {
        schema: {
          params: workoutIdParamsSchema,
          body: workoutUpdateInputSchema,
          response: { 200: workoutSchema },
        },
      },
      async (request) => updateWorkout(db, request.params.id, request.body),
    );

    typed.delete(
      '/workouts/:id',
      { schema: { params: workoutIdParamsSchema, response: { 200: deleteWorkoutResultSchema } } },
      async (request) => deleteWorkout(db, request.params.id),
    );
  };
}
