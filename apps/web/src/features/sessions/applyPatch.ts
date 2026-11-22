import type { Session, SessionPatchInput } from '@wt/shared';

// Сервер обрезает пробелы, а пустую заметку хранит как null.
const normalizeNote = (value: string | null): string | null => value?.trim() || null;

/** Оптимистичное применение PATCH к закэшированной сессии (зеркало серверной логики, без побочных эффектов). */
export function applySessionPatch(session: Session, patch: SessionPatchInput, now: string): Session {
  const setPatches = new Map((patch.sets ?? []).map((s) => [s.id, s]));
  const skips = new Map((patch.exercises ?? []).map((e) => [e.exercisePosition, e.isSkipped]));

  return {
    ...session,
    notes: patch.notes !== undefined ? normalizeNote(patch.notes) : session.notes,
    status: patch.status ?? session.status,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      isSkipped: skips.get(exercise.exercisePosition) ?? exercise.isSkipped,
      sets: exercise.sets.map((set) => {
        const p = setPatches.get(set.id);
        if (!p) return set;
        return {
          ...set,
          actualReps: p.actualReps !== undefined ? p.actualReps : set.actualReps,
          actualWeight: p.actualWeight !== undefined ? p.actualWeight : set.actualWeight,
          rpe: p.rpe !== undefined ? p.rpe : set.rpe,
          notes: p.notes !== undefined ? normalizeNote(p.notes) : set.notes,
          isCompleted: p.isCompleted ?? set.isCompleted,
          completedAt: p.isCompleted === undefined ? set.completedAt : p.isCompleted ? (set.completedAt ?? now) : null,
        };
      }),
    })),
  };
}
