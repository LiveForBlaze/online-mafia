// ISO 3166-1 alpha-2 список стран с русскими / английскими названиями.
//
// В БД храним код (например `RU`, `KZ`). UI рендерит локализованное имя
// и emoji-флаг. Допустимы пустые/неизвестные значения (для старых записей,
// созданных до этого списка) — getCountry вернёт null, UI покажет сам код.
//
// Список ограничен официальными странами + крупными зависимыми
// территориями. Если чего-то критично не хватает — PR welcome.

export interface Country {
  code: string; // ISO 3166-1 alpha-2, uppercase
  ru: string;
  en: string;
  flag: string; // emoji (regional indicator pair)
}

export const COUNTRIES: Country[] = [
  { code: 'RU', ru: 'Россия', en: 'Russia', flag: '🇷🇺' },
  { code: 'UA', ru: 'Украина', en: 'Ukraine', flag: '🇺🇦' },
  { code: 'BY', ru: 'Беларусь', en: 'Belarus', flag: '🇧🇾' },
  { code: 'KZ', ru: 'Казахстан', en: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'KG', ru: 'Киргизия', en: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'UZ', ru: 'Узбекистан', en: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'AM', ru: 'Армения', en: 'Armenia', flag: '🇦🇲' },
  { code: 'AZ', ru: 'Азербайджан', en: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'GE', ru: 'Грузия', en: 'Georgia', flag: '🇬🇪' },
  { code: 'MD', ru: 'Молдова', en: 'Moldova', flag: '🇲🇩' },
  { code: 'LT', ru: 'Литва', en: 'Lithuania', flag: '🇱🇹' },
  { code: 'LV', ru: 'Латвия', en: 'Latvia', flag: '🇱🇻' },
  { code: 'EE', ru: 'Эстония', en: 'Estonia', flag: '🇪🇪' },
  { code: 'PL', ru: 'Польша', en: 'Poland', flag: '🇵🇱' },
  { code: 'CZ', ru: 'Чехия', en: 'Czechia', flag: '🇨🇿' },
  { code: 'DE', ru: 'Германия', en: 'Germany', flag: '🇩🇪' },
  { code: 'GB', ru: 'Великобритания', en: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', ru: 'США', en: 'United States', flag: '🇺🇸' },
  { code: 'CA', ru: 'Канада', en: 'Canada', flag: '🇨🇦' },
  { code: 'IL', ru: 'Израиль', en: 'Israel', flag: '🇮🇱' },
  { code: 'TR', ru: 'Турция', en: 'Türkiye', flag: '🇹🇷' },
  { code: 'AE', ru: 'ОАЭ', en: 'UAE', flag: '🇦🇪' },
  { code: 'AF', ru: 'Афганистан', en: 'Afghanistan', flag: '🇦🇫' },
  { code: 'AL', ru: 'Албания', en: 'Albania', flag: '🇦🇱' },
  { code: 'DZ', ru: 'Алжир', en: 'Algeria', flag: '🇩🇿' },
  { code: 'AD', ru: 'Андорра', en: 'Andorra', flag: '🇦🇩' },
  { code: 'AO', ru: 'Ангола', en: 'Angola', flag: '🇦🇴' },
  { code: 'AR', ru: 'Аргентина', en: 'Argentina', flag: '🇦🇷' },
  { code: 'AU', ru: 'Австралия', en: 'Australia', flag: '🇦🇺' },
  { code: 'AT', ru: 'Австрия', en: 'Austria', flag: '🇦🇹' },
  { code: 'BH', ru: 'Бахрейн', en: 'Bahrain', flag: '🇧🇭' },
  { code: 'BD', ru: 'Бангладеш', en: 'Bangladesh', flag: '🇧🇩' },
  { code: 'BE', ru: 'Бельгия', en: 'Belgium', flag: '🇧🇪' },
  { code: 'BO', ru: 'Боливия', en: 'Bolivia', flag: '🇧🇴' },
  { code: 'BA', ru: 'Босния и Герцеговина', en: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'BR', ru: 'Бразилия', en: 'Brazil', flag: '🇧🇷' },
  { code: 'BG', ru: 'Болгария', en: 'Bulgaria', flag: '🇧🇬' },
  { code: 'KH', ru: 'Камбоджа', en: 'Cambodia', flag: '🇰🇭' },
  { code: 'CM', ru: 'Камерун', en: 'Cameroon', flag: '🇨🇲' },
  { code: 'CL', ru: 'Чили', en: 'Chile', flag: '🇨🇱' },
  { code: 'CN', ru: 'Китай', en: 'China', flag: '🇨🇳' },
  { code: 'CO', ru: 'Колумбия', en: 'Colombia', flag: '🇨🇴' },
  { code: 'CR', ru: 'Коста-Рика', en: 'Costa Rica', flag: '🇨🇷' },
  { code: 'HR', ru: 'Хорватия', en: 'Croatia', flag: '🇭🇷' },
  { code: 'CU', ru: 'Куба', en: 'Cuba', flag: '🇨🇺' },
  { code: 'CY', ru: 'Кипр', en: 'Cyprus', flag: '🇨🇾' },
  { code: 'DK', ru: 'Дания', en: 'Denmark', flag: '🇩🇰' },
  { code: 'DO', ru: 'Доминиканская Республика', en: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'EC', ru: 'Эквадор', en: 'Ecuador', flag: '🇪🇨' },
  { code: 'EG', ru: 'Египет', en: 'Egypt', flag: '🇪🇬' },
  { code: 'ET', ru: 'Эфиопия', en: 'Ethiopia', flag: '🇪🇹' },
  { code: 'FI', ru: 'Финляндия', en: 'Finland', flag: '🇫🇮' },
  { code: 'FR', ru: 'Франция', en: 'France', flag: '🇫🇷' },
  { code: 'GH', ru: 'Гана', en: 'Ghana', flag: '🇬🇭' },
  { code: 'GR', ru: 'Греция', en: 'Greece', flag: '🇬🇷' },
  { code: 'GT', ru: 'Гватемала', en: 'Guatemala', flag: '🇬🇹' },
  { code: 'HN', ru: 'Гондурас', en: 'Honduras', flag: '🇭🇳' },
  { code: 'HK', ru: 'Гонконг', en: 'Hong Kong', flag: '🇭🇰' },
  { code: 'HU', ru: 'Венгрия', en: 'Hungary', flag: '🇭🇺' },
  { code: 'IS', ru: 'Исландия', en: 'Iceland', flag: '🇮🇸' },
  { code: 'IN', ru: 'Индия', en: 'India', flag: '🇮🇳' },
  { code: 'ID', ru: 'Индонезия', en: 'Indonesia', flag: '🇮🇩' },
  { code: 'IR', ru: 'Иран', en: 'Iran', flag: '🇮🇷' },
  { code: 'IQ', ru: 'Ирак', en: 'Iraq', flag: '🇮🇶' },
  { code: 'IE', ru: 'Ирландия', en: 'Ireland', flag: '🇮🇪' },
  { code: 'IT', ru: 'Италия', en: 'Italy', flag: '🇮🇹' },
  { code: 'JM', ru: 'Ямайка', en: 'Jamaica', flag: '🇯🇲' },
  { code: 'JP', ru: 'Япония', en: 'Japan', flag: '🇯🇵' },
  { code: 'JO', ru: 'Иордания', en: 'Jordan', flag: '🇯🇴' },
  { code: 'KE', ru: 'Кения', en: 'Kenya', flag: '🇰🇪' },
  { code: 'KR', ru: 'Южная Корея', en: 'South Korea', flag: '🇰🇷' },
  { code: 'KW', ru: 'Кувейт', en: 'Kuwait', flag: '🇰🇼' },
  { code: 'LA', ru: 'Лаос', en: 'Laos', flag: '🇱🇦' },
  { code: 'LB', ru: 'Ливан', en: 'Lebanon', flag: '🇱🇧' },
  { code: 'LY', ru: 'Ливия', en: 'Libya', flag: '🇱🇾' },
  { code: 'LI', ru: 'Лихтенштейн', en: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LU', ru: 'Люксембург', en: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MY', ru: 'Малайзия', en: 'Malaysia', flag: '🇲🇾' },
  { code: 'MT', ru: 'Мальта', en: 'Malta', flag: '🇲🇹' },
  { code: 'MX', ru: 'Мексика', en: 'Mexico', flag: '🇲🇽' },
  { code: 'MC', ru: 'Монако', en: 'Monaco', flag: '🇲🇨' },
  { code: 'MN', ru: 'Монголия', en: 'Mongolia', flag: '🇲🇳' },
  { code: 'ME', ru: 'Черногория', en: 'Montenegro', flag: '🇲🇪' },
  { code: 'MA', ru: 'Марокко', en: 'Morocco', flag: '🇲🇦' },
  { code: 'MM', ru: 'Мьянма', en: 'Myanmar', flag: '🇲🇲' },
  { code: 'NP', ru: 'Непал', en: 'Nepal', flag: '🇳🇵' },
  { code: 'NL', ru: 'Нидерланды', en: 'Netherlands', flag: '🇳🇱' },
  { code: 'NZ', ru: 'Новая Зеландия', en: 'New Zealand', flag: '🇳🇿' },
  { code: 'NI', ru: 'Никарагуа', en: 'Nicaragua', flag: '🇳🇮' },
  { code: 'NG', ru: 'Нигерия', en: 'Nigeria', flag: '🇳🇬' },
  { code: 'KP', ru: 'КНДР', en: 'North Korea', flag: '🇰🇵' },
  { code: 'MK', ru: 'Северная Македония', en: 'North Macedonia', flag: '🇲🇰' },
  { code: 'NO', ru: 'Норвегия', en: 'Norway', flag: '🇳🇴' },
  { code: 'OM', ru: 'Оман', en: 'Oman', flag: '🇴🇲' },
  { code: 'PK', ru: 'Пакистан', en: 'Pakistan', flag: '🇵🇰' },
  { code: 'PA', ru: 'Панама', en: 'Panama', flag: '🇵🇦' },
  { code: 'PY', ru: 'Парагвай', en: 'Paraguay', flag: '🇵🇾' },
  { code: 'PE', ru: 'Перу', en: 'Peru', flag: '🇵🇪' },
  { code: 'PH', ru: 'Филиппины', en: 'Philippines', flag: '🇵🇭' },
  { code: 'PT', ru: 'Португалия', en: 'Portugal', flag: '🇵🇹' },
  { code: 'QA', ru: 'Катар', en: 'Qatar', flag: '🇶🇦' },
  { code: 'RO', ru: 'Румыния', en: 'Romania', flag: '🇷🇴' },
  { code: 'SA', ru: 'Саудовская Аравия', en: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'RS', ru: 'Сербия', en: 'Serbia', flag: '🇷🇸' },
  { code: 'SG', ru: 'Сингапур', en: 'Singapore', flag: '🇸🇬' },
  { code: 'SK', ru: 'Словакия', en: 'Slovakia', flag: '🇸🇰' },
  { code: 'SI', ru: 'Словения', en: 'Slovenia', flag: '🇸🇮' },
  { code: 'ZA', ru: 'ЮАР', en: 'South Africa', flag: '🇿🇦' },
  { code: 'ES', ru: 'Испания', en: 'Spain', flag: '🇪🇸' },
  { code: 'LK', ru: 'Шри-Ланка', en: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'SE', ru: 'Швеция', en: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', ru: 'Швейцария', en: 'Switzerland', flag: '🇨🇭' },
  { code: 'SY', ru: 'Сирия', en: 'Syria', flag: '🇸🇾' },
  { code: 'TW', ru: 'Тайвань', en: 'Taiwan', flag: '🇹🇼' },
  { code: 'TJ', ru: 'Таджикистан', en: 'Tajikistan', flag: '🇹🇯' },
  { code: 'TZ', ru: 'Танзания', en: 'Tanzania', flag: '🇹🇿' },
  { code: 'TH', ru: 'Таиланд', en: 'Thailand', flag: '🇹🇭' },
  { code: 'TN', ru: 'Тунис', en: 'Tunisia', flag: '🇹🇳' },
  { code: 'TM', ru: 'Туркменистан', en: 'Turkmenistan', flag: '🇹🇲' },
  { code: 'UG', ru: 'Уганда', en: 'Uganda', flag: '🇺🇬' },
  { code: 'UY', ru: 'Уругвай', en: 'Uruguay', flag: '🇺🇾' },
  { code: 'VE', ru: 'Венесуэла', en: 'Venezuela', flag: '🇻🇪' },
  { code: 'VN', ru: 'Вьетнам', en: 'Vietnam', flag: '🇻🇳' },
  { code: 'YE', ru: 'Йемен', en: 'Yemen', flag: '🇾🇪' },
  { code: 'ZW', ru: 'Зимбабве', en: 'Zimbabwe', flag: '🇿🇼' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Найти страну по ISO-коду (case-insensitive). null если кода нет в списке. */
export function getCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Локализованное имя страны. Если кода нет в списке — возвращаем raw code. */
export function countryLabel(code: string | null | undefined, locale: 'ru' | 'en'): string {
  if (!code) return '';
  const c = BY_CODE.get(code.trim().toUpperCase());
  return c ? c[locale] : code;
}
