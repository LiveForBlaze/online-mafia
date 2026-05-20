// Tiny relative-time formatter for the lobby list.
// Returns Russian strings like "только что", "3 мин назад", "2 ч назад", "вчера".
// Intentionally dependency-free — we don't want to pull in a date library
// just for a couple of human-readable strings.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTimeRu(iso: string, now: Date = new Date()): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';

  const diffSec = Math.max(0, Math.floor((now.getTime() - created) / 1000));

  if (diffSec < 30) return 'только что';
  if (diffSec < MINUTE) return 'меньше минуты назад';

  if (diffSec < HOUR) {
    const minutes = Math.floor(diffSec / MINUTE);
    return `${minutes} ${pluralRu(minutes, ['минуту', 'минуты', 'минут'])} назад`;
  }

  if (diffSec < DAY) {
    const hours = Math.floor(diffSec / HOUR);
    return `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])} назад`;
  }

  const days = Math.floor(diffSec / DAY);
  if (days === 1) return 'вчера';
  return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])} назад`;
}

// Russian plural form selector. `forms` is [one, few, many].
function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}
