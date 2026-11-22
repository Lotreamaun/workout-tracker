import { describe, expect, it } from 'vitest';
import { suggestNames } from './suggestNames';

describe('suggestNames', () => {
  const names = ['Жим лёжа', 'Жим штанги лёжа', 'Жим ногами', 'Присед', 'Тяга штанги'];

  it('ищет по нормализованному названию: регистр, пробелы и ё не важны', () => {
    expect(suggestNames(names, 'жим')).toEqual(['Жим лёжа', 'Жим штанги лёжа', 'Жим ногами']);
    expect(suggestNames(names, '  ЖИМ   ШТАНГИ ')).toEqual(['Жим штанги лёжа']);
  });

  it('не показывает полное совпадение, включая нормализованное', () => {
    expect(suggestNames(['Жим', 'Жим лёжа', 'жим'], 'ЖИМ')).toEqual(['Жим лёжа']);
    expect(suggestNames(names, 'Присед')).toEqual([]);
  });

  it('ничего не возвращает для ввода короче двух символов после trim', () => {
    expect(suggestNames(names, '')).toEqual([]);
    expect(suggestNames(names, ' ж ')).toEqual([]);
  });

  it('ограничивает число подсказок и убирает повторы по ключу имени', () => {
    expect(suggestNames(names, 'жим', 2)).toEqual(['Жим лёжа', 'Жим штанги лёжа']);
    expect(suggestNames(names, 'жим', 0)).toEqual([]);
    expect(suggestNames(['Жим лёжа', ' жим  лежа ', 'Жим штанги'], 'жим')).toEqual([
      'Жим лёжа',
      'Жим штанги',
    ]);
  });
});
