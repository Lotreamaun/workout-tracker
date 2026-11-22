import type { SessionSet } from '@wt/shared';
import { describe, expect, it } from 'vitest';
import { buildCompletePatch, parseReps, parseRpe, parseWeight, type SetDraft } from './setInput';

function set(overrides: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    setNumber: 1,
    plannedReps: 8,
    actualReps: null,
    plannedWeight: 80,
    actualWeight: null,
    rpe: null,
    isCompleted: false,
    completedAt: null,
    notes: null,
    ...overrides,
  };
}

function draft(reps: string, weight: string, rpe: string): SetDraft {
  return { reps: parseReps(reps), weight: parseWeight(weight), rpe: parseRpe(rpe) };
}

describe('парсеры ввода фактических значений', () => {
  it('parseReps принимает целые 0..1000 и пустоту', () => {
    expect(parseReps('8')).toEqual({ valid: true, value: 8 });
    expect(parseReps(' 10 ')).toEqual({ valid: true, value: 10 });
    expect(parseReps('')).toEqual({ valid: true, value: null });
    for (const text of ['8.5', '-1', '1001', 'abc', 'NaN']) {
      expect(parseReps(text)).toEqual({ valid: false, value: null });
    }
  });

  it('parseWeight понимает запятую и ограничение 0..2000', () => {
    expect(parseWeight('82.5')).toEqual({ valid: true, value: 82.5 });
    expect(parseWeight('82,5')).toEqual({ valid: true, value: 82.5 });
    expect(parseWeight('')).toEqual({ valid: true, value: null });
    expect(parseWeight('-0.1')).toEqual({ valid: false, value: null });
    expect(parseWeight('2001')).toEqual({ valid: false, value: null });
  });

  it('parseRpe принимает значения с шагом 0.5 в диапазоне 1..10', () => {
    expect(parseRpe('7.5')).toEqual({ valid: true, value: 7.5 });
    expect(parseRpe('7,5')).toEqual({ valid: true, value: 7.5 });
    expect(parseRpe('')).toEqual({ valid: true, value: null });
    for (const text of ['0', '11', '7.3', 'abc']) {
      expect(parseRpe(text)).toEqual({ valid: false, value: null });
    }
  });
});

describe('buildCompletePatch', () => {
  it('подставляет план при пустом вводе (сценарий «быстрая отметка»)', () => {
    expect(buildCompletePatch(set(), draft('', '', ''))).toEqual({
      id: 'set-1',
      isCompleted: true,
      actualReps: 8,
      actualWeight: 80,
    });
  });

  it('сохраняет введённые значения и не отправляет неизменившиеся', () => {
    expect(buildCompletePatch(set(), draft('9', '82.5', '7.5'))).toEqual({
      id: 'set-1',
      isCompleted: true,
      actualReps: 9,
      actualWeight: 82.5,
      rpe: 7.5,
    });
    expect(buildCompletePatch(set({ actualReps: 8, actualWeight: 80, rpe: 7.5 }), draft('8', '80', '7.5'))).toEqual({
      id: 'set-1',
      isCompleted: true,
    });
  });

  it('не отправляет невалидные поля и подставляет план только для валидных пустых', () => {
    expect(buildCompletePatch(set(), draft('8.5', 'abc', '11'))).toEqual({ id: 'set-1', isCompleted: true });
    expect(buildCompletePatch(set(), draft('9', 'abc', '11'))).toEqual({
      id: 'set-1',
      isCompleted: true,
      actualReps: 9,
    });
  });
});
