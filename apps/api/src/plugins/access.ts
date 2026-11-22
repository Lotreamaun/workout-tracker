import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ERROR_CODES } from '@wt/shared';
import { AppError } from './errors';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Защита API общим ключом: `Authorization: Bearer <apiToken>` для всех `/api/*`, кроме `GET /api/health`
 * и CORS preflight. Это не авторизация: пользователей и сессий нет. `/media/*` ключа не требует (UUID в именах).
 */
export function registerAccess(app: FastifyInstance, apiToken: string | undefined) {
  if (!apiToken) {
    app.log.warn('API_TOKEN не задан: API открыт без ключа доступа');
    return;
  }
  const expected = sha256(apiToken);

  app.addHook('onRequest', async (request) => {
    // Смотрим и на маршрут из роутера (`/%61pi/...` роутер декодирует и направит в /api), и на сырой URL
    // (несовпавшие запросы и wildcard статики не имеют маршрута /api/*): любой /api/* без ключа даёт 401.
    const route = request.routeOptions.url ?? '';
    if (!(route.startsWith('/api/') || request.url.startsWith('/api/')) || request.method === 'OPTIONS') return;
    if (route === '/api/health' && (request.method === 'GET' || request.method === 'HEAD')) return;

    const header = request.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    // Хэши одинаковой длины: timingSafeEqual не бросает и не раскрывает длину ключа.
    if (!timingSafeEqual(sha256(given), expected)) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Нужен ключ доступа');
    }
  });
}
