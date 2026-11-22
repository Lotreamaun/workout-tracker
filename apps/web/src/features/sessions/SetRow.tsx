import { useEffect, useRef, useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import type { SessionSet, SessionSetPatch } from '@wt/shared';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatNumber, buildCompletePatch, parseReps, parseRpe, parseWeight } from './setInput';
import { formatSetValues } from './format';

const DEBOUNCE_MS = 600;

/**
 * Локальный черновик поля ввода. Когда значение на сервере меняется (в том числе откатом после ошибки),
 * черновик этого поля сбрасывается к нему.
 */
function useDraft(serverValue: number | null) {
  const [text, setText] = useState(formatNumber(serverValue));
  const [seen, setSeen] = useState(serverValue);
  if (seen !== serverValue) {
    setSeen(serverValue);
    setText(formatNumber(serverValue));
  }
  return [text, setText] as const;
}

interface SetRowProps {
  set: SessionSet;
  disabled: boolean;
  onSave: (patch: SessionSetPatch) => void;
  /** Подход только что отмечен выполненным (запуск таймера отдыха). */
  onCompleted: () => void;
}

export function SetRow({ set, disabled, onSave, onCompleted }: SetRowProps) {
  const [repsText, setRepsText] = useDraft(set.actualReps);
  const [weightText, setWeightText] = useDraft(set.actualWeight);
  const [rpeText, setRpeText] = useDraft(set.rpe);
  const [noteText, setNoteText] = useState(set.notes ?? '');
  const [seenNote, setSeenNote] = useState(set.notes);
  const [noteOpen, setNoteOpen] = useState(set.notes !== null);
  if (seenNote !== set.notes) {
    setSeenNote(set.notes);
    setNoteText(set.notes ?? '');
  }

  const reps = parseReps(repsText);
  const weight = parseWeight(weightText);
  const rpe = parseRpe(rpeText);

  // Сохраняет только изменённые и валидные поля (по blur и через debounce).
  const commit = () => {
    const patch: SessionSetPatch = { id: set.id };
    if (reps.valid && reps.value !== set.actualReps) patch.actualReps = reps.value;
    if (weight.valid && weight.value !== set.actualWeight) patch.actualWeight = weight.value;
    if (rpe.valid && rpe.value !== set.rpe) patch.rpe = rpe.value;
    if (noteText.trim() !== (set.notes ?? '')) patch.notes = noteText;
    if (Object.keys(patch).length > 1) onSave(patch);
  };

  // Таймеру и размонтированию нужна свежая версия commit (актуальные черновики и данные подхода).
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    const id = setTimeout(() => commitRef.current(), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [repsText, weightText, rpeText, noteText]);

  // Несохранённый ввод не теряется при уходе с экрана.
  useEffect(() => {
    const ref = commitRef;
    return () => ref.current();
  }, []);

  const allValid = reps.valid && weight.valid && rpe.valid;

  const toggle = () => {
    if (set.isCompleted) {
      onSave({ id: set.id, isCompleted: false });
      return;
    }
    if (!allValid) return;
    const patch = buildCompletePatch(set, { reps, weight, rpe });
    if (noteText.trim() !== (set.notes ?? '')) patch.notes = noteText;
    onSave(patch);
    onCompleted();
  };

  const invalidClass = (valid: boolean) => (valid ? '' : 'border-destructive');

  return (
    <li className={cn('space-y-2 rounded-lg border p-3', set.isCompleted && 'border-primary/50 bg-primary/10')}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">Подход {set.setNumber}</span>
        <span className="text-muted-foreground" aria-label="План">
          план {formatSetValues(set.plannedReps, set.plannedWeight)}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs text-muted-foreground">Повторы</span>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={repsText}
            placeholder={set.plannedReps === null ? '' : String(set.plannedReps)}
            disabled={disabled}
            aria-invalid={!reps.valid}
            className={cn('text-center text-lg font-semibold', invalidClass(reps.valid))}
            onChange={(e) => setRepsText(e.target.value)}
            onBlur={() => commit()}
          />
        </label>
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs text-muted-foreground">Вес, кг</span>
          <Input
            inputMode="decimal"
            value={weightText}
            placeholder={set.plannedWeight === null ? '' : String(set.plannedWeight)}
            disabled={disabled}
            aria-invalid={!weight.valid}
            className={cn('text-center text-lg font-semibold', invalidClass(weight.valid))}
            onChange={(e) => setWeightText(e.target.value)}
            onBlur={() => commit()}
          />
        </label>
        <label className="w-16 space-y-1">
          <span className="block text-xs text-muted-foreground">RPE</span>
          <Input
            inputMode="decimal"
            value={rpeText}
            placeholder="1–10"
            disabled={disabled}
            aria-invalid={!rpe.valid}
            className={cn('px-1 text-center text-lg font-semibold', invalidClass(rpe.valid))}
            onChange={(e) => setRpeText(e.target.value)}
            onBlur={() => commit()}
          />
        </label>
        <button
          type="button"
          onClick={toggle}
          disabled={disabled || (!set.isCompleted && !allValid)}
          aria-pressed={set.isCompleted}
          aria-label={set.isCompleted ? `Снять отметку с подхода ${set.setNumber}` : `Отметить подход ${set.setNumber}`}
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-xl border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
            set.isCompleted
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input text-muted-foreground hover:bg-accent',
          )}
        >
          <Check className="size-7" aria-hidden />
        </button>
      </div>

      {!allValid && (
        <p role="alert" className="text-xs text-destructive">
          Проверьте значения: повторы — целое число, RPE — от 1 до 10 с шагом 0,5.
        </p>
      )}

      {noteOpen ? (
        <AutoTextarea
          rows={1}
          value={noteText}
          maxLength={2000}
          placeholder="Заметка к подходу"
          disabled={disabled}
          aria-label={`Заметка к подходу ${set.setNumber}`}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => commit()}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setNoteOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <MessageSquare className="size-3.5" aria-hidden /> Заметка
        </button>
      )}
    </li>
  );
}
