import { ServerCrash } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ApiErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ApiErrorState({ error, onRetry }: ApiErrorStateProps) {
  const isNetwork = error instanceof ApiError && error.isNetwork;
  const unauthorized = error instanceof ApiError && error.status === 401;
  const title = isNetwork ? 'Сервер недоступен' : unauthorized ? 'Нужен ключ доступа' : 'Не удалось загрузить данные';
  const description = isNetwork
    ? 'Проверьте, что backend запущен и устройство в одной сети с компьютером.'
    : unauthorized
      ? 'Введите ключ доступа, чтобы открыть данные.'
      : error instanceof Error
      ? error.message
      : 'Произошла неизвестная ошибка.';

  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
      <ServerCrash className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
