import { SESSION_LIMITS, WORKOUT_LIMITS, type SessionSet, type SessionSetPatch } from '@wt/shared';

export interface ParsedNumber {
  valid: boolean;
  /** null — поле пустое (или невалидное). */
  value: number | null;
}

const EMPTY: ParsedNumber = { valid: true, value: null };
const INVALID: ParsedNumber = { valid: false, value: null };

function parseNumber(text: string, accept: (n: number) => boolean): ParsedNumber {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return EMPTY;
  const value = Number(trimmed);
  return Number.isFinite(value) && accept(value) ? { valid: true, value } : INVALID;
}

export const parseReps = (text: string) =>
  parseNumber(text, (n) => Number.isInteger(n) && n >= 0 && n <= WORKOUT_LIMITS.repsMax);

export const parseWeight = (text: string) => parseNumber(text, (n) => n >= 0 && n <= WORKOUT_LIMITS.weightMax);

export const parseRpe = (text: string) =>
  parseNumber(
    text,
    (n) => n >= SESSION_LIMITS.rpeMin && n <= SESSION_LIMITS.rpeMax && Number.isInteger(n / SESSION_LIMITS.rpeStep),
  );

export function formatNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

export interface SetDraft {
  reps: ParsedNumber;
  weight: ParsedNumber;
  rpe: ParsedNumber;
}

/**
 * Патч «отметить подход выполненным»: пустые фактические повторы/вес заменяются плановыми,
 * введённые значения сохраняются как есть. Невалидные поля в патч не попадают.
 */
export function buildCompletePatch(set: SessionSet, draft: SetDraft): SessionSetPatch {
  const patch: SessionSetPatch = { id: set.id, isCompleted: true };
  const reps = draft.reps.valid ? (draft.reps.value ?? set.plannedReps) : undefined;
  const weight = draft.weight.valid ? (draft.weight.value ?? set.plannedWeight) : undefined;
  if (reps !== undefined && reps !== set.actualReps) patch.actualReps = reps;
  if (weight !== undefined && weight !== set.actualWeight) patch.actualWeight = weight;
  if (draft.rpe.valid && draft.rpe.value !== set.rpe) patch.rpe = draft.rpe.value;
  return patch;
}
