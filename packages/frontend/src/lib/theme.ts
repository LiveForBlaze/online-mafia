// Theme: dark-only for now. The light variant was removed because the
// brand artwork and surfaces are designed for the dark palette.
// Kept as a tiny module rather than deleted so existing imports still work.

export function bootstrapTheme(): void {
  document.documentElement.setAttribute('data-theme', 'dark');
}
