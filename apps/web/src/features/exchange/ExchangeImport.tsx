import { useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ImportCommitResponse,
  ImportMode,
  ImportPreviewResponse,
  ImportSummary,
} from '@wt/shared';
import { FileUp } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatExchangeError } from './formatExchangeError';

function Summary({ summary }: { summary: ImportSummary }) {
  const rows: [string, number][] = [
    ['Тренировок создаётся', summary.workoutsToCreate],
    ['Тренировок обновляется', summary.workoutsToUpdate],
    ['Упражнений создаётся', summary.exercisesToCreate],
    ['Сессий создаётся', summary.sessionsToCreate],
    ['Сессий пропускается', summary.sessionsToSkip],
    ['Подходов создаётся', summary.setsToCreate],
  ];
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WorkoutList({ workouts }: { workouts: ImportPreviewResponse['workouts'] }) {
  if (workouts.length === 0) {
    return <p className="text-sm text-muted-foreground">Тренировок в документе нет.</p>;
  }
  return (
    <ul className="space-y-2">
      {workouts.map((workout, index) => (
        <li
          key={`${workout.name}-${index}`}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border p-3 text-sm"
        >
          <span className="font-medium">{workout.name}</span>
          <span className="text-muted-foreground">
            {workout.action === 'create' ? 'новая' : 'обновление'} · {workout.exerciseCount} упражнений
          </span>
        </li>
      ))}
    </ul>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Предупреждения</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

export function ExchangeImport() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('add');
  const [parsedData, setParsedData] = useState<unknown>();
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const check = useMutation({ mutationFn: api.previewImport });
  const commit = useMutation({
    mutationFn: api.commitImport,
    onSuccess: (data) => {
      // Импорт меняет и шаблоны, и историю — оба списка должны обновиться.
      void queryClient.invalidateQueries({ queryKey: ['workouts'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setPreview(null);
      setResult(data);
      setConfirmOpen(false);
      setConfirmReplace(false);
      setErrors([]);
    },
    onError: (error) => {
      setErrors(formatExchangeError(error));
      setConfirmOpen(false);
    },
  });

  const resetOutcome = () => {
    setPreview(null);
    setResult(null);
    setParsedData(undefined);
    setErrors([]);
  };

  const updateText = (value: string) => {
    setText(value);
    setFileName(null);
    resetOutcome();
  };

  const changeMode = (next: ImportMode) => {
    setMode(next);
    setConfirmReplace(false);
    resetOutcome();
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // позволяет выбрать тот же файл повторно
    if (!file) return;
    try {
      updateText(await file.text());
      setFileName(file.name);
    } catch {
      setErrors(['Не удалось прочитать файл']);
    }
  };

  const checkDocument = () => {
    setErrors([]);
    setPreview(null);
    setResult(null);
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      setParsedData(undefined);
      setErrors(['Некорректный JSON']);
      return;
    }
    setParsedData(data);
    check.mutate(
      { mode, data },
      {
        onSuccess: (response) => setPreview(response),
        onError: (error) => setErrors(formatExchangeError(error)),
      },
    );
  };

  const confirmImport = () => {
    if (parsedData === undefined || (mode === 'replace' && !confirmReplace)) return;
    commit.mutate({
      mode,
      data: parsedData,
      ...(mode === 'replace' ? { confirmReplace: true } : {}),
    });
  };

  const busy = check.isPending || commit.isPending;

  return (
    <section aria-labelledby="import-heading" className="space-y-3">
      <h2 id="import-heading" className="text-lg font-semibold">
        Импорт
      </h2>

      <Card className="gap-4 px-5">
        <p className="text-sm text-muted-foreground">
          Вставьте JSON, полученный от ChatGPT, или выберите файл. Перед записью документ можно проверить.
        </p>

        <div className="space-y-2">
          <Label htmlFor="exchange-import-text">JSON документа</Label>
          <Textarea
            id="exchange-import-text"
            value={text}
            onChange={(event) => updateText(event.target.value)}
            placeholder={'{ "schemaVersion": 1, "workouts": [] }'}
            rows={7}
            className="min-h-40 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Label htmlFor="exchange-import-file" className="cursor-pointer">
              <FileUp aria-hidden /> Выбрать .json
            </Label>
          </Button>
          <input
            id="exchange-import-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void selectFile(event)}
            className="sr-only"
          />
          {fileName && <span className="min-w-0 truncate text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Режим импорта</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-[:checked]:border-primary">
            <input
              type="radio"
              name="exchange-import-mode"
              value="add"
              checked={mode === 'add'}
              onChange={() => changeMode('add')}
              className="size-5 accent-primary"
            />
            Добавить как новые
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-[:checked]:border-primary">
            <input
              type="radio"
              name="exchange-import-mode"
              value="replace"
              checked={mode === 'replace'}
              onChange={() => changeMode('replace')}
              className="size-5 accent-primary"
            />
            Обновить существующие (замена)
          </label>
        </fieldset>

        <Button type="button" size="lg" className="w-full" disabled={busy || text.trim() === ''} onClick={checkDocument}>
          {check.isPending ? 'Проверяем…' : 'Проверить'}
        </Button>

        {errors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl border border-destructive/60 p-4 text-sm text-destructive">
            {errors.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </Card>

      {preview && (
        <Card className="gap-4 px-5">
          <h3 className="font-semibold">Результат проверки</h3>
          <WorkoutList workouts={preview.workouts} />
          <Summary summary={preview.summary} />
          <Warnings items={preview.warnings} />

          {mode === 'replace' && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-destructive/50 p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(event) => setConfirmReplace(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-destructive"
              />
              Я понимаю, что существующие тренировки будут перезаписаны
            </label>
          )}

          <AlertDialog
            open={confirmOpen}
            onOpenChange={(open) => {
              setConfirmOpen(open);
              if (!open) commit.reset();
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="lg"
                className="w-full"
                variant={mode === 'replace' ? 'destructive' : 'default'}
                disabled={busy || (mode === 'replace' && !confirmReplace)}
              >
                Импортировать
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Импортировать данные?</AlertDialogTitle>
                <AlertDialogDescription>
                  {mode === 'replace'
                    ? 'Тренировки с совпадающими id будут перезаписаны: упражнения обновятся. История занятий сохранится.'
                    : 'Тренировки и завершённые сессии из документа будут добавлены как новые записи.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Summary summary={preview.summary} />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={commit.isPending}>Отмена</AlertDialogCancel>
                <Button
                  type="button"
                  variant={mode === 'replace' ? 'destructive' : 'default'}
                  disabled={commit.isPending}
                  onClick={confirmImport}
                >
                  {commit.isPending ? 'Импортируем…' : 'Подтвердить'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      )}

      {result && (
        <Card className="gap-3 px-5" role="status">
          <h3 className="font-semibold">Импорт завершён</h3>
          <Summary summary={result.summary} />
          <WorkoutList workouts={result.workouts} />
          <Warnings items={result.warnings} />
        </Card>
      )}
    </section>
  );
}
