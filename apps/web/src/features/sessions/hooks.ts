import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session, SessionPatchInput, SessionStatus } from '@wt/shared';
import { api } from '@/lib/api';
import { formatSaveError } from '@/features/workouts/formatError';
import { applySessionPatch } from './applyPatch';

const sessionsKey = ['sessions'] as const;
const sessionKey = (id: string) => [...sessionsKey, 'detail', id] as const;

export function useSessions(status: SessionStatus, limit: number) {
  return useQuery({
    queryKey: [...sessionsKey, 'list', status, limit],
    queryFn: () => api.listSessions(status, limit),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: sessionKey(id ?? ''),
    queryFn: () => api.getSession(id!),
    enabled: id !== undefined,
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workoutId: string) => api.startSession(workoutId),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey(session.id), session);
      void queryClient.invalidateQueries({ queryKey: [...sessionsKey, 'list'] });
    },
  });
}

/**
 * Автосохранение факта: PATCH с оптимистичным обновлением кэша и откатом при ошибке.
 * Ошибка последнего неудачного сохранения доступна в `error` (сбрасывается следующим успешным).
 */
export function useSaveSession(sessionId: string) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutationKey = [...sessionsKey, 'patch', sessionId];

  const mutation = useMutation({
    mutationKey,
    mutationFn: (input: SessionPatchInput) => api.patchSession(sessionId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: sessionKey(sessionId) });
      const previous = queryClient.getQueryData<Session>(sessionKey(sessionId));
      if (previous) {
        queryClient.setQueryData(sessionKey(sessionId), applySessionPatch(previous, input, new Date().toISOString()));
      }
      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(sessionKey(sessionId), context.previous);
      setError(formatSaveError(err).join(' '));
    },
    onSuccess: () => setError(null),
    onSettled: () => {
      // Пока есть другие несохранённые изменения, ответ сервера может затереть их оптимистичное состояние.
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: sessionKey(sessionId) });
        void queryClient.invalidateQueries({ queryKey: [...sessionsKey, 'list'] });
      }
    },
  });

  return { save: mutation.mutate, saveAsync: mutation.mutateAsync, error, clearError: () => setError(null) };
}

export function useCompleteSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes?: string | null) => api.completeSession(sessionId, notes === undefined ? {} : { notes }),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey(sessionId), session);
      void queryClient.invalidateQueries({ queryKey: [...sessionsKey, 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
  });
}

/** Отмена активной тренировки (`status: "abandoned"`) без оптимистичного обновления: экран закрывается после ответа. */
export function useAbandonSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patchSession(sessionId, { status: 'abandoned' }),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey(sessionId), session);
      void queryClient.invalidateQueries({ queryKey: [...sessionsKey, 'list'] });
    },
  });
}
