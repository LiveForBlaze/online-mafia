// Cheap, deterministic pre-filter for user-generated names.
//
// Runs BEFORE the LLM-based moderator and short-circuits obvious Russian
// profanity, including a few common obfuscation patterns the LLM has missed
// in production (split words, syllable swaps). Goals, in order:
//
//   1) Catch the bypass patterns we've actually seen ("Матье Бал" /
//      "мать ебал" with a space; "Япид Араск" / "пидараск" with a syllable
//      swap; etc.) before they hit the LLM.
//   2) Save the Haiku call for trivially bad input.
//   3) Add zero false positives on normal Russian text — every substring
//      in the list below is one that does NOT appear inside a legitimate
//      Russian word.
//
// What we deliberately do NOT do here:
//   - Catch innuendo / euphemisms ("Голубая Устрица", "Полюция",
//     "Междуножное пироженное"). These need semantic understanding —
//     they go through the LLM with explicit few-shot examples.
//   - Catch English profanity. We have very little of it in practice and
//     the LLM handles it well.
//
// Maintenance: only add a root here if you can convince yourself it
// produces zero false positives on common Russian words. When in doubt,
// leave it for the LLM. False positives here are worse than false
// negatives, because the LLM is the next line of defence anyway.

// Latin look-alikes → Cyrillic. Used to defeat the trick of typing
// "хуй" as "xyй" (Latin x, y) or "пидор" as "пиdор". Lowercase only.
const LATIN_TO_CYRILLIC: Readonly<Record<string, string>> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
};

// Substrings that are unambiguous Russian profanity — none of these
// appear inside a normal Russian word. Match against the SPACE-STRIPPED
// normalized form so "Матье Бал" → "матьебал" → contains "матьеб".
const PROFANITY_SUBSTRINGS: readonly string[] = [
  // классические корни
  'пизд',
  'хуй',
  'хуя',
  'хую',
  'хуи',
  'хуё',
  'хуев',
  'хуёв',
  'ебло',
  'долбоеб',
  'долбоёб',
  // слурс / pejorative
  'пидор',
  'пидар',
  'пидер',
  'педрил',
  // прочий мат
  'гандон',
  'кандон',
  'залуп',
  'мудак',
  'мудил',
  'дроч',
  // составные обфускации
  'матьеб', // "Матье Бал" / "мать ебал" со снятыми пробелами
];

export interface PrefilterResult {
  blocked: boolean;
  reason?: string;
}

// Normalize for substring scanning: lowercase, map Latin look-alikes to
// Cyrillic, drop every non-letter (spaces, digits, punctuation, emoji).
// Keeps both Cyrillic and Latin letters; the look-alike map covers the
// common impostors but a stray "z" is fine — it just won't match anything.
export function normalizeForScan(input: string): string {
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    const mapped = LATIN_TO_CYRILLIC[ch] ?? ch;
    // Cyrillic а-я + ё, Latin a-z. Drop everything else (spaces, dots,
    // dashes, digits, emoji — all the stuff a determined user wedges
    // between the syllables of a curse).
    if (/[а-яёa-z]/.test(mapped)) out += mapped;
  }
  return out;
}

export function prefilterName(candidate: string): PrefilterResult {
  const scan = normalizeForScan(candidate);
  if (!scan) return { blocked: false };

  for (const root of PROFANITY_SUBSTRINGS) {
    if (scan.includes(root)) {
      return { blocked: true, reason: 'profanity' };
    }
  }
  return { blocked: false };
}
