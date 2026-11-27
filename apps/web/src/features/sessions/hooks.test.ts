import { describe, expect, it, vi } from 'vitest';
import type { Session, SessionListItem } from '@wt/shared';

// hooks.ts тянет за собой api.ts, который при импорте читает window.location;
// для чистых функций хранилища достаточно заглушки модуля.
vi.mock('@/lib/api', () => ({
  api: {},
  ApiError: class extends Error {},
}));

import { sessionToListItem, syncActiveList } from './hooks';

const SETS = [
  { id: 'set-1', isCompleted: true },
  { id: 'set-2', isCompleted: false },
];

function makeSession(overrides: Partial<Session> = {}): Session {
  const exercise = {
    workoutExerciseId: 'we-1',
    exercisePosition: 0,
    name: 'Присед',
    description: null,
    restSeconds: 60,
    isSkipped: false,
    exerciseId: null,
    media: [],
    sets: SETS.map((set, index) => ({
      id: set.id,
      setNumber: index + 1,
      plannedReps: 10,
      actualReps: null,
      plannedWeight: 40,
      actualWeight: null,
      rpe: null,
      isCompleted: set.isCompleted,
      completedAt: set.isCompleted ? '2026-11-27T10:01:00.000Z' : null,
      notes: null,
    })),
  };

  return {
    id: 'session-1',
    workoutId: 'workout-1',
    workoutNameSnapshot: 'Фулбоди',
    status: 'in_progress',
    startedAt: '2026-11-27T10:00:00.000Z',
    completedAt: null,
    notes: null,
    exercises: [exercise],
    ...overrides,
  };
}

describe('sessionToListItem', () => {
  it('собирает карточку с прогрессом подходов из детальной сессии', () => {
    const item = sessionToListItem(makeSession());

    expect(item).toEqual({
      id: 'session-1',
      workoutId: 'workout-1',
      workoutNameSnapshot: 'Фулбоди',
      status: 'in_progress',
      startedAt: '2026-11-27T10:00:00.000Z',
      completedAt: null,
      completedSets: 1,
      totalSets: 2,
    });
  });
});

describe('syncActiveList', () => {
  it('заполняет список до первого ответа API', () => {
    const session = makeSession();

    expect(syncActiveList(undefined, session)).toEqual([sessionToListItem(session)]);
  });

  it('оставляет загруженный список как есть, даже если он пуст или в нём другая сессия', () => {
    const session = makeSession();
    const items = [sessionToListItem(makeSession({ id: 'session-2' }))];

    expect(syncActiveList([], session)).toBeUndefined();
    expect(syncActiveList(items, session)).toBeUndefined();
  });

  it('убирает сессию из списка при терминальном статусе', () => {
    const items: SessionListItem[] = [sessionToListItem(makeSession())];

    expect(syncActiveList(items, makeSession({ status: 'completed', completedAt: '2026-11-27T11:00:00.000Z' })))
      .toEqual([]);
    expect(syncActiveList(items, makeSession({ status: 'abandoned' }))).toEqual([]);
  });

  it('не создаёт кэш, если терминальной сессии в списке не было', () => {
    const abandoned = makeSession({ id: 'session-2', status: 'abandoned' });

    expect(syncActiveList(undefined, abandoned)).toBeUndefined();
    expect(syncActiveList([sessionToListItem(makeSession())], abandoned)).toBeUndefined();
  });
});
