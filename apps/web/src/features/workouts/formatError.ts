import { ApiError } from '@/lib/api';

const FIELD_LABELS: Record<string, string> = {
  name: 'название',
  description: 'описание',
  plannedSets: 'подходы',
  plannedReps: 'повторы',
  plannedWeight: 'вес',
  restSeconds: 'отдых',
  notes: 'заметки',
  id: 'упражнение',
};

function describePath(path: string): string {
  const match = /^exercises\.(\d+)(?:\.(\w+))?$/.exec(path);
  if (match) {
    const field = match[2] ? FIELD_LABELS[match[2]] ?? match[2] : undefined;
    return field ? `Упражнение ${Number(match[1]) + 1}, ${field}` : `Упражнение ${Number(match[1]) + 1}`;
  }
  const label = FIELD_LABELS[path];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : path;
}

/** Превращает ошибку API в список строк для показа пользователю (включая details валидации). */
export function formatSaveError(error: unknown): string[] {
  if (!(error instanceof ApiError)) return ['Не удалось выполнить действие'];
  if (error.isNetwork) return ['Сервер недоступен. Проверьте подключение.'];
  if (error.code === 'WORKOUT_ARCHIVED') return ['Тренировка в архиве и не может быть изменена.'];

  const lines: string[] = [];
  if (Array.isArray(error.details)) {
    for (const item of error.details) {
      if (item && typeof item === 'object' && 'message' in item && typeof item.message === 'string') {
        const path = 'path' in item && typeof item.path === 'string' ? item.path : undefined;
        lines.push(path ? `${describePath(path)}: ${item.message}` : item.message);
      }
    }
  }
  return lines.length > 0 ? lines : [error.message];
}
