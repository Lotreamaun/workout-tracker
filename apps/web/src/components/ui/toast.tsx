import { X } from 'lucide-react';
import { useToast } from '@/lib/use-toast';

/** Контейнер in-app уведомлений (toast) поверх всего интерфейса. */
export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-60 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="w-full max-w-sm rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{toast.title}</p>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => dismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {toast.body && <p className="mt-1 text-sm text-muted-foreground">{toast.body}</p>}
          {toast.action && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
                className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
