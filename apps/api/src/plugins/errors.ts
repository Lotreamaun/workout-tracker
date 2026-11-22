import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { ERROR_CODES, type ApiErrorBody } from '@wt/shared';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function registerErrorHandlers(app: FastifyInstance, { spaFallback = false } = {}) {
  app.setNotFoundHandler((request, reply) => {
    // Клиентские маршруты SPA (/history и т.п.) отдаём index.html; неизвестный /api/* остаётся 404 в формате API.
    if (spaFallback && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    reply
      .status(404)
      .send(body(ERROR_CODES.NOT_FOUND, `Маршрут ${request.method} ${request.url.split('?')[0]} не найден`));
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send(body(error.code, error.message, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || undefined,
        message: issue.message,
        keyword: issue.keyword,
      }));
      return reply.status(400).send(body(ERROR_CODES.VALIDATION_ERROR, 'Некорректные данные запроса', details));
    }

    const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500 && !isResponseSerializationError(error)) {
      // Клиентские ошибки Fastify (например, невалидный JSON): статус сохраняем, stack не отдаём.
      const code = status === 404 ? ERROR_CODES.NOT_FOUND : status === 400 ? ERROR_CODES.VALIDATION_ERROR : 'BAD_REQUEST';
      return reply.status(status).send(body(code, error.message));
    }

    request.log.error(error);
    return reply.status(500).send(body(ERROR_CODES.INTERNAL_ERROR, 'Внутренняя ошибка сервера'));
  });
}
