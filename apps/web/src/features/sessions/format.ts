const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short' });

/** Дата и время в локальной часовой зоне пользователя. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** «1 ч 05 мин», «42 мин», «меньше минуты»; `null`, если сессия не завершена. */
export function formatDuration(startedAt: string, completedAt: string | null): string | null {
  if (!completedAt) return null;
  const minutes = Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 60_000));
  if (minutes < 1) return 'меньше минуты';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} ч ${String(rest).padStart(2, '0')} мин` : `${rest} мин`;
}

function pad(value: number | null, unit: string): string | null {
  return value === null ? null : `${value}${unit}`;
}

/** «8 × 80 кг», «8 повт.», «80 кг» или «—», если ничего не задано. */
export function formatSetValues(reps: number | null, weight: number | null): string {
  const w = pad(weight, ' кг');
  if (reps !== null && w) return `${reps} × ${w}`;
  if (reps !== null) return `${reps} повт.`;
  return w ?? '—';
}

export function formatSetsProgress(completedSets: number, totalSets: number): string {
  return `${completedSets} из ${totalSets} подходов`;
}
