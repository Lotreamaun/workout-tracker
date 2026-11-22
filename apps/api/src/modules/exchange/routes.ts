import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EXCHANGE_LIMITS,
  exchangeDocumentSchema,
  exportQuerySchema,
  importCommitInputSchema,
  importCommitResponseSchema,
  importPreviewInputSchema,
  importPreviewResponseSchema,
} from '@wt/shared';
import type { Db } from '../../db/client';
import { commitImport, exportData, previewImport } from './service';

export function exchangeRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/export',
      { schema: { querystring: exportQuerySchema, response: { 200: exchangeDocumentSchema } } },
      async (request) => exportData(db, request.query.includeSessions),
    );

    typed.post(
      '/import/preview',
      {
        bodyLimit: EXCHANGE_LIMITS.bodyLimitBytes,
        schema: { body: importPreviewInputSchema, response: { 200: importPreviewResponseSchema } },
      },
      async (request) => previewImport(db, request.body),
    );

    typed.post(
      '/import/commit',
      {
        bodyLimit: EXCHANGE_LIMITS.bodyLimitBytes,
        schema: { body: importCommitInputSchema, response: { 200: importCommitResponseSchema } },
      },
      async (request) => commitImport(db, request.body),
    );
  };
}
