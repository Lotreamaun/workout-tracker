import { ApiError } from '@/lib/api';

/** Превращает ошибку обмена (включая details валидации) в список строк «путь: сообщение». */
export function formatExchangeError(error: unknown): string[] {
  if (!(error instanceof ApiError)) return ['Не удалось выполнить действие'];
  if (error.isNetwork) return ['Сервер недоступен. Проверьте подключение.'];

  const lines: string[] = [];
  if (Array.isArray(error.details)) {
    for (const item of error.details) {
      if (!item || typeof item !== 'object' || !('message' in item) || typeof item.message !== 'string') continue;
      const path = 'path' in item && typeof item.path === 'string' ? item.path : undefined;
      lines.push(path ? `${path}: ${item.message}` : item.message);
    }
  }
  return lines.length > 0 ? lines : [error.message];
}
