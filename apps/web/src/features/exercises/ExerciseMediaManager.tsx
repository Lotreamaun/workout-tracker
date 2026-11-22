import { useState, type ChangeEvent } from 'react';
import { ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { MEDIA_LIMITS, type Exercise } from '@wt/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/sessions/ConfirmDialog';
import { formatSaveError } from '@/features/workouts/formatError';
import { cn } from '@/lib/utils';
import { useDeleteExercise, useDeleteExerciseMedia, useUploadExerciseMedia } from './hooks';
import { MediaThumb } from './MediaThumb';
import { MediaViewer } from './MediaViewer';

const { maxPerExercise, maxUploadBytes } = MEDIA_LIMITS;

interface PendingFile {
  id: string;
  file: File;
}

interface FileError {
  id: string;
  name: string;
  message: string;
}

/** Сетка медиа упражнения: просмотр, удаление и последовательная загрузка с индикаторами сжатия. */
export function ExerciseMediaManager({ exercise }: { exercise: Exercise }) {
  const navigate = useNavigate();
  const upload = useUploadExerciseMedia(exercise.id);
  const removeMedia = useDeleteExerciseMedia(exercise.id);
  const removeExercise = useDeleteExercise();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [errors, setErrors] = useState<FileError[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const uploading = pending.length > 0;
  const canAdd = exercise.media.length + pending.length < maxPerExercise;

  const addError = (name: string, message: string) =>
    setErrors((list) => [...list, { id: crypto.randomUUID(), name, message }]);

  const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // чтобы можно было выбрать тот же файл ещё раз
    if (files.length === 0) return;

    setErrors([]);
    const accepted: PendingFile[] = [];
    const localErrors: FileError[] = [];
    const reject = (name: string, message: string) =>
      localErrors.push({ id: crypto.randomUUID(), name, message });

    for (const file of files) {
      if (file.size > maxUploadBytes) {
        reject(file.name, `файл больше ${maxUploadBytes / 1024 / 1024} МБ`);
      } else if (exercise.media.length + accepted.length >= maxPerExercise) {
        reject(file.name, `Можно прикрепить не больше ${maxPerExercise} медиа`);
      } else {
        accepted.push({ id: crypto.randomUUID(), file });
      }
    }
    setErrors(localErrors);
    setPending(accepted);

    // Сервер сжимает файлы по одному, поэтому и отправляем по очереди.
    for (const item of accepted) {
      try {
        await upload.mutateAsync(item.file);
      } catch (error) {
        addError(item.file.name, formatSaveError(error).join(' '));
      }
      setPending((list) => list.filter((p) => p.id !== item.id));
    }
  };

  return (
    <section aria-labelledby="media-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="media-heading" className="text-lg font-semibold">
          Медиа
        </h2>
        <p className="text-sm text-muted-foreground">
          {exercise.media.length} из {maxPerExercise}
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {exercise.media.map((item, index) => (
          <li key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
            <button
              type="button"
              aria-label={`Открыть медиа ${index + 1}`}
              onClick={() => setViewerIndex(index)}
              className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <MediaThumb media={item} />
            </button>
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  aria-label={`Удалить медиа ${index + 1}`}
                  className="absolute top-0 right-0 flex size-11 items-start justify-end p-1.5 outline-none"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-black/70 text-white">
                    <X className="size-4" aria-hidden />
                  </span>
                </button>
              }
              title="Удалить медиа?"
              description="Файл будет удалён из библиотеки и пропадёт во всех тренировках с этим упражнением."
              confirmLabel="Удалить"
              pendingLabel="Удаляем…"
              destructive
              pending={removeMedia.isPending && removeMedia.variables === item.id}
              error={removeMedia.isError && removeMedia.variables === item.id ? formatSaveError(removeMedia.error).join(' ') : null}
              onConfirm={() => removeMedia.mutate(item.id)}
              onClose={removeMedia.reset}
            />
          </li>
        ))}

        {pending.map(({ id, file }) => (
          <li
            key={id}
            aria-label={`Сжатие: ${file.name}`}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-secondary text-xs text-muted-foreground"
          >
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
            Сжатие…
          </li>
        ))}

        {canAdd && (
          <li>
            <label
              className={cn(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50',
                uploading && 'pointer-events-none opacity-50',
              )}
            >
              <ImagePlus className="size-6" aria-hidden />
              Добавить
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                disabled={uploading}
                onChange={(e) => void onFilesSelected(e)}
                className="sr-only"
              />
            </label>
          </li>
        )}
      </ul>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {errors.map((error) => (
            <li key={error.id}>
              {error.name}: {error.message}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Фото, GIF и видео до {maxUploadBytes / 1024 / 1024} МБ. Сервер сожмёт их автоматически.
      </p>

      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline" size="lg" className="w-full text-destructive">
            <Trash2 aria-hidden /> Удалить из библиотеки
          </Button>
        }
        title="Удалить упражнение из библиотеки?"
        description="Все медиа этого упражнения будут удалены. Тренировки и история не изменятся."
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        destructive
        pending={removeExercise.isPending}
        error={removeExercise.isError ? formatSaveError(removeExercise.error).join(' ') : null}
        onConfirm={() => removeExercise.mutate(exercise.id, { onSuccess: () => navigate('/exercises') })}
        onClose={removeExercise.reset}
      />

      <MediaViewer
        title={exercise.name}
        media={exercise.media}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </section>
  );
}
