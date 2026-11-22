import { describe, expect, it } from 'vitest';
import { toSingleLine } from './auto-textarea-utils';

describe('toSingleLine', () => {
  it('заменяет \\n, \\r\\n и \\r одним пробелом', () => {
    expect(toSingleLine('первая\nвторая')).toBe('первая вторая');
    expect(toSingleLine('первая\r\nвторая')).toBe('первая вторая');
    expect(toSingleLine('первая\rвторая')).toBe('первая вторая');
  });

  it('заменяет каждый перевод строки подряд отдельным пробелом', () => {
    expect(toSingleLine('a\n\nb')).toBe('a  b');
    expect(toSingleLine('a\r\n\r\nb')).toBe('a  b');
    expect(toSingleLine('a\r\n\nb')).toBe('a  b');
  });

  it('не меняет текст без переводов строк', () => {
    expect(toSingleLine('Очень длинноеНазваниеБезПробелов 123')).toBe('Очень длинноеНазваниеБезПробелов 123');
  });

  it('возвращает пустую строку для пустого ввода', () => {
    expect(toSingleLine('')).toBe('');
  });
});
