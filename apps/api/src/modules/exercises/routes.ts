import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  MEDIA_LIMITS,
  exerciseIdParamsSchema,
  exerciseListSchema,
  exerciseMediaParamsSchema,
  exerciseSchema,
} from '@wt/shared';
import type { Db } from '../../db/client';
import type { MediaConfig } from './media';
import { addMedia, deleteExercise, deleteMedia, getExercise, listExercises, type UploadStream } from './service';

export interface ExerciseRoutesOptions {
  /** Лимит размера загружаемого файла; переопределяется в тестах. */
  maxUploadBytes?: number;
}

export function exerciseRoutes(
  db: Db,
  media: MediaConfig,
  { maxUploadBytes = MEDIA_LIMITS.maxUploadBytes }: ExerciseRoutesOptions = {},
) {
  return async (app: FastifyInstance) => {
    // Превышение лимита обрабатываем сами (file.truncated → 413), а не через ошибку плагина.
    await app.register(multipart, {
      limits: { fileSize: maxUploadBytes, files: 1, fields: 0 },
      throwFileSizeLimit: false,
    });
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get('/exercises', { schema: { response: { 200: exerciseListSchema } } }, async () => listExercises(db));

    typed.get(
      '/exercises/:id',
      { schema: { params: exerciseIdParamsSchema, response: { 200: exerciseSchema } } },
      async (request) => getExercise(db, request.params.id),
    );

    typed.delete('/exercises/:id', { schema: { params: exerciseIdParamsSchema } }, async (request, reply) => {
      await deleteExercise(db, media, request.params.id);
      return reply.status(204).send();
    });

    typed.post(
      '/exercises/:id/media',
      { schema: { params: exerciseIdParamsSchema, response: { 201: exerciseSchema } } },
      async (request, reply) => {
        const exercise = await addMedia(db, media, request.params.id, async () => {
          if (!request.isMultipart()) return undefined;
          return (await request.file())?.file as UploadStream | undefined;
        });
        return reply.status(201).send(exercise);
      },
    );

    typed.delete(
      '/exercises/:id/media/:mediaId',
      { schema: { params: exerciseMediaParamsSchema, response: { 200: exerciseSchema } } },
      async (request) => deleteMedia(db, media, request.params.id, request.params.mediaId),
    );
  };
}
