import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
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
import { formatSaveError } from './formatError';
import { useDeleteWorkout } from './hooks';

export interface WorkoutsPageState {
  notice?: string;
}

export function DeleteWorkoutButton({ workoutId }: { workoutId: string }) {
  const navigate = useNavigate();
  const remove = useDeleteWorkout();
  const [open, setOpen] = useState(false);

  const confirm = () =>
    remove.mutate(workoutId, {
      onSuccess: ({ result }) => {
        const notice = result === 'deleted' ? 'Удалено' : 'Перенесено в архив (есть история)';
        navigate('/workouts', { state: { notice } satisfies WorkoutsPageState });
      },
    });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="w-full text-destructive">
          <Trash2 aria-hidden /> Удалить тренировку
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
          <AlertDialogDescription>
            Шаблон будет удалён. Если по этой тренировке уже есть история занятий, она будет перенесена в архив, а
            история сохранится.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <div role="alert" className="text-sm text-destructive">
            {formatSaveError(remove.error).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Отмена</AlertDialogCancel>
          {/* Обычная кнопка, а не Action: диалог должен остаться открытым при ошибке. */}
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={confirm}>
            {remove.isPending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
