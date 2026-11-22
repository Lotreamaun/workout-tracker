import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Exercise } from '@wt/shared';
import { api } from '@/lib/api';

const exercisesKey = ['exercises'] as const;
const exerciseKey = (id: string) => [...exercisesKey, id] as const;

export function useExercises() {
  return useQuery({ queryKey: exercisesKey, queryFn: api.listExercises });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: exerciseKey(id ?? ''),
    queryFn: () => api.getExercise(id!),
    enabled: id !== undefined,
  });
}

/** Медиа показываются в списке, шаблонах и сессиях, поэтому после изменений их кэш устаревает. */
function invalidateMediaViews(queryClient: QueryClient) {
  // exact: карточку упражнения обновляем ответом сервера, без лишнего запроса и гонки с ним.
  void queryClient.invalidateQueries({ queryKey: exercisesKey, exact: true });
  void queryClient.invalidateQueries({ queryKey: ['workouts'] });
  void queryClient.invalidateQueries({ queryKey: ['sessions'] });
}

function useExerciseUpdate<TVariables>(id: string, mutationFn: (variables: TVariables) => Promise<Exercise>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (exercise) => {
      queryClient.setQueryData(exerciseKey(id), exercise);
      invalidateMediaViews(queryClient);
    },
  });
}

/** Загружает один файл; несколько файлов вызывающий код отправляет последовательно. */
export function useUploadExerciseMedia(id: string) {
  return useExerciseUpdate(id, (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.uploadExerciseMedia(id, form);
  });
}

export function useDeleteExerciseMedia(id: string) {
  return useExerciseUpdate(id, (mediaId: string) => api.deleteExerciseMedia(id, mediaId));
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteExercise(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: exercisesKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: ['workouts'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
