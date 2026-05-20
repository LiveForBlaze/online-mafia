// Returns the first letter or digit of a nickname, uppercased, for avatar circles.
// Falls back to "?" when the nickname has no letters or digits.

export function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
