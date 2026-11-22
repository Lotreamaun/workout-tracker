import { describe, expect, it } from 'vitest';
import { exerciseNameKey } from './exercises';

describe('exerciseNameKey', () => {
  it('обрезает пробелы по краям', () => {
    expect(exerciseNameKey('  Жим лёжа  ')).toBe('жим лежа');
  });

  it('схлопывает повторяющиеся пробелы, табы и переводы строк', () => {
    expect(exerciseNameKey(' жим \t\n  лежа ')).toBe('жим лежа');
  });

  it('приводит к нижнему регистру', () => {
    expect(exerciseNameKey('ПРИСЕДАНИЯ')).toBe('приседания');
  });

  it('заменяет ё и Ё на е', () => {
    expect(exerciseNameKey('Ёлка ёж')).toBe('елка еж');
    expect(exerciseNameKey('Жим ЛЁЖА')).toBe('жим лежа');
  });

  it('нормализует кириллические названия', () => {
    expect(exerciseNameKey('Тяга Штанги')).toBe('тяга штанги');
    expect(exerciseNameKey('Присед')).toBe('присед');
  });

  it('идемпотентна', () => {
    const key = exerciseNameKey(' Жим\tлёжа ');
    expect(exerciseNameKey(key)).toBe(key);
  });
});
