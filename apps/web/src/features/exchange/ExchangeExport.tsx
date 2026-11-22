import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ExchangeDocument } from '@wt/shared';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { CHATGPT_PROMPT } from './chatgptPrompt';
import { copyText } from './clipboard';
import { formatExchangeError } from './formatExchangeError';

interface ManualCopy {
  title: string;
  text: string;
}

export function ExchangeExport() {
  const [includeSessions, setIncludeSessions] = useState(true);
  const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [manualCopy, setManualCopy] = useState<ManualCopy | null>(null);
  const exportDocument = useMutation({ mutationFn: (withSessions: boolean) => api.exportData(withSessions) });

  const loadDocument = async (): Promise<ExchangeDocument | null> => {
    setErrors([]);
    setNotice('');
    try {
      return await exportDocument.mutateAsync(includeSessions);
    } catch (error) {
      setErrors(formatExchangeError(error));
      return null;
    }
  };

  const copy = async (text: string, success: string, title: string) => {
    setErrors([]);
    setNotice('');
    if (await copyText(text)) {
      setManualCopy(null);
      setNotice(success);
    } else {
      setManualCopy({ title, text });
      setNotice('Не удалось скопировать автоматически. Скопируйте текст вручную.');
    }
  };

  const download = async () => {
    const data = await loadDocument();
    if (!data) return;

    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `workout-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('Файл скачан');
  };

  const copyJson = async () => {
    const data = await loadDocument();
    if (data) await copy(JSON.stringify(data, null, 2), 'JSON скопирован', 'JSON для ручного копирования');
  };

  return (
    <section aria-labelledby="export-heading" className="space-y-3">
      <h2 id="export-heading" className="text-lg font-semibold">
        Экспорт
      </h2>

      <Card className="gap-4 px-5">
        <p className="text-sm text-muted-foreground">
          Скачайте или скопируйте JSON с планом тренировок, чтобы отправить его в ChatGPT.
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={includeSessions}
            onChange={(event) => setIncludeSessions(event.target.checked)}
            className="size-5 accent-primary"
          />
          Включить историю
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" size="lg" disabled={exportDocument.isPending} onClick={() => void download()}>
            <Download aria-hidden /> {exportDocument.isPending ? 'Готовим JSON…' : 'Скачать JSON'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={exportDocument.isPending}
            onClick={() => void copyJson()}
          >
            <Copy aria-hidden /> Скопировать
          </Button>
        </div>
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {errors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl border border-destructive/60 p-4 text-sm text-destructive">
            {errors.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </Card>

      <Card className="gap-3 px-5">
        <div className="space-y-1">
          <h3 className="font-semibold">Подсказка для ChatGPT</h3>
          <p className="text-sm text-muted-foreground">
            Скопируйте текст и отправьте его вместе с экспортированным JSON.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => void copy(CHATGPT_PROMPT, 'Подсказка скопирована', 'Подсказка для ручного копирования')}
        >
          <Copy aria-hidden /> Скопировать подсказку
        </Button>
        {manualCopy?.title === 'Подсказка для ручного копирования' && (
          <p className="text-sm text-muted-foreground">Текст подсказки показан в поле ниже.</p>
        )}
      </Card>

      {manualCopy && (
        <Card className="gap-2 px-5">
          <Label htmlFor="exchange-manual-copy">{manualCopy.title}</Label>
          <Textarea
            id="exchange-manual-copy"
            value={manualCopy.text}
            readOnly
            rows={8}
            className="min-h-40 font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        </Card>
      )}
    </section>
  );
}
