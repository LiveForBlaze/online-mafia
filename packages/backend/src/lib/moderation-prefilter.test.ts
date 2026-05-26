import { describe, expect, it } from 'vitest';

import { normalizeForScan, prefilterName } from './moderation-prefilter.js';

describe('prefilterName — blocks obvious profanity and bypass patterns', () => {
  it.each([
    // Прямой мат — корни
    ['Пизда'],
    ['ХУЙ'],
    ['пидор'],
    ['Гандон'],
    ['Залупа'],
    ['Мудак'],
    ['Дрочила'],
    // Bypass-паттерны которые случились в проде
    ['Матье Бал'], // split: мать + ебал → "матьебал" содержит "матьеб"
    ['Япид Араск'], // rebracketing: "япидараск" содержит "пидар"
    ['МАТЬЕ БАЛ'], // тот же кейс в верхнем регистре
    // Latin look-alike символы
    ['xyй'], // x→х, y→у
    ['пидoр'], // Latin o → Cyrillic о
    // Пробелы / точки / цифры внутри корня
    ['п и з д а'],
    ['х.у.й'],
    ['пид1ор'],
  ])('blocks "%s"', (input) => {
    const result = prefilterName(input);
    expect(result.blocked).toBe(true);
  });
});

describe('prefilterName — does NOT block normal text', () => {
  it.each([
    ['Турнир имени Пушкина'],
    ['Кровавая ночь'],
    ['Бойня'],
    ['Чёрные плащи'],
    ['Death Row'],
    ['kek228'],
    ['xX_Dragon_Xx'],
    // Намеренно НЕ блокируем — false-positive если бы добавили "ебан"/"педик"
    ['Лебанонский кедр'],
    ['Энциклопедика'],
    ['Хлебал суп'], // "ебал" не в списке
    ['Команда мечты'], // "манда" не в списке
    ['Себя любить'],
    ['пиз∂а'], // ∂ дропается, остаётся "пиза" — не корень
    [''],
    ['   '],
  ])('allows "%s"', (input) => {
    const result = prefilterName(input);
    expect(result.blocked).toBe(false);
  });
});

describe('normalizeForScan', () => {
  it('strips spaces, punctuation, digits', () => {
    expect(normalizeForScan('п и з. д-а 123')).toBe('пизда');
  });

  it('maps Latin look-alikes to Cyrillic (lowercase)', () => {
    expect(normalizeForScan('XYЙ')).toBe('хуй');
    // 'p' и 'o' маппятся (выглядят как Cyrillic), 'i', 'd', 'r' — нет.
    expect(normalizeForScan('PIDOR')).toBe('рidоr');
  });

  it('drops emoji and unknown symbols', () => {
    expect(normalizeForScan('пизда🔥')).toBe('пизда');
  });
});
