import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { toSingleLine } from '@/components/ui/auto-textarea-utils';
import { cn } from '@/lib/utils';

type AutoTextareaProps = React.ComponentProps<'textarea'> & {
  /** Поле названия: Enter не вставляет перевод строки, а переводы строк во вводимом тексте заменяются пробелами. */
  singleLine?: boolean;
};

/**
 * Textarea, которая растёт по высоте под текст (без внутренней прокрутки и ручного resize).
 * `rows` задаёт минимальную высоту: 2 строки для многострочного поля, 1 для `singleLine`.
 */
function AutoTextarea({ className, singleLine = false, rows, onChange, onKeyDown, ref, ...props }: AutoTextareaProps) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRef = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const resize = () => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // box-sizing: border-box — к scrollHeight добавляем рамки.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  };

  // Пересчёт при каждом изменении текста (в том числе пришедшего снаружи).
  React.useLayoutEffect(resize, [props.value]);

  // Пересчёт при изменении ширины (поворот экрана, ресайз окна): меняется число строк.
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    // Во время IME-композиции Enter подтверждает ввод, его трогать нельзя.
    if (singleLine && event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (singleLine) {
      const el = event.target;
      const normalized = toSingleLine(el.value);
      if (normalized !== el.value) {
        // Сохраняем позицию курсора при замене (\r\n сжимается в один пробел).
        const caret = toSingleLine(el.value.slice(0, el.selectionStart)).length;
        el.value = normalized;
        el.setSelectionRange(caret, caret);
      }
    }
    onChange?.(event);
  };

  return (
    <Textarea
      ref={setRef}
      rows={rows ?? (singleLine ? 1 : 2)}
      // min-h-11 — как у Input: однострочное поле той же высоты, что и соседние.
      className={cn('min-h-11 resize-none overflow-hidden', className)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { AutoTextarea };
