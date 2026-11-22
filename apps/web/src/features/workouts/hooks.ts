import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkoutCreateInput, WorkoutUpdateInput } from '@wt/shared';
import { api } from '@/lib/api';

const workoutsKey = ['workouts'] as const;

export function useWorkouts() {
  return useQuery({ queryKey: workoutsKey, queryFn: api.listWorkouts });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: [...workoutsKey, id],
    queryFn: () => api.getWorkout(id!),
    enabled: id !== undefined,
  });
}

/** Создаёт тренировку (без `id`) или обновляет существующую (с `id`). */
export function useSaveWorkout(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkoutCreateInput | WorkoutUpdateInput) =>
      id === undefined ? api.createWorkout(input as WorkoutCreateInput) : api.updateWorkout(id, input),
    onSuccess: (saved) => {
      // Просмотр после сохранения сразу показывает новые данные, без мелькания старых.
      queryClient.setQueryData([...workoutsKey, saved.id], saved);
      return queryClient.invalidateQueries({ queryKey: workoutsKey });
    },
  });
}

export function useDeleteWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWorkout(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workoutsKey }),
  });
}
