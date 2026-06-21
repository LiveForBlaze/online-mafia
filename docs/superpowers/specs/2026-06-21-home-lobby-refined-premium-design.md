# Home + Lobby redesign — "Refined Premium" (dark-cherry brand)

**Date:** 2026-06-21
**Scope:** Visible facelift of the home page (LobbyListPage: hero, lobby list, marketing
sections, empty state) and the lobby waiting room (LobbyRoom). No rebrand, no logic change.
**Direction chosen:** Refined Premium — elevate quality (elevation, soft cherry glow,
hover-lift, spacing rhythm) without radically reshaping layout or data.

## Constraints (non-negotiable)

- Dark-only, dark-cherry brand. No new brand hue. No rebrand.
- Tokens only — no raw hex / no raw px in components (CI hard rule). New tokens go in
  `styles/theme.css`; new utilities in `styles/globals.css`.
- All motion gated `motion-safe:`. Respect the global `prefers-reduced-motion` reset.
- Contrast ≥ 4.5:1 for text. Non-color cues kept (status dots already paired with text).
- Game/lobby logic, hooks, routing, a11y semantics (role=table/row/progressbar) unchanged.
- New visible copy → i18n keys added to all 6 locales (en/ru/uk/be/kk/ka).

## New design tokens (theme.css) + utilities (globals.css)

- `--color-card-hover`: one step lighter than `--color-card` (e.g. oklch(0.23 0 0)) — raised surface.
- `--shadow-glow-accent`: soft low-alpha cherry glow for CTAs / live accents.
- `--shadow-elev`: standard card elevation shadow (consistent scale).
- globals utility `.hover-lift`: `motion-safe:transition` + on hover `-translate-y-0.5`,
  `--shadow-elev`, border brightens toward accent.
- globals: faint radial cherry glow helper for hero background; subtle top page-gradient for depth.

## Surface specs

### 1. HomeHero (`features/lobby/components/HomeHero.tsx`)

- Radial cherry glow behind the wordmark/splash (decorative, aria-hidden).
- Stat row → raised "stat band": elevated pill row with dividers; **pulsing dot** next to
  active-games when count > 0 (`motion-safe:animate-pulse`).
- Primary CTA "Создать стол" gains `--shadow-glow-accent` on hover.
- Tighten vertical rhythm; keep two-column wordmark + splash.

### 2. Lobby list (`LobbyListTable.tsx`, `LobbyCard.tsx`, `EmptyLobbyState.tsx`, `LobbyListPage.tsx`)

- Rows become raised row-cards: `hover-lift`, accent border on hover, soft shadow.
  Keep the existing grid columns, seat-fill bar, status dot+text, host avatar — only elevate.
- Search + privacy-filter bar: raised panel (`bg-card-hover`, border, subtle shadow).
- EmptyLobbyState → proper elevated empty card with glow + prominent CTA (keep dashed-to-solid).
- LobbyListPage: spacing/rhythm polish only (no logic change).

### 3. Marketing (`HowItWorksSection.tsx`, `HomeFeatures.tsx`, `RewardAvatarPromo.tsx`)

- Bento-ish card grid, unified elevation, lucide icons, cherry accent on headings, spacing.

### 4. Lobby room (`LobbyRoom.tsx`, `SeatGrid.tsx`, `JudgeSlot.tsx`, `LobbyChat.tsx`, `LobbyRoomPage.tsx`)

- Seat grid → seat cards: avatar, ready state with **non-color cue (✓ + color)**, host/judge badges.
- Chat panel + ready/start controls: unified elevation. Behavior/logic identical.

## Implementation (parallel agents, disjoint files)

- **Wave 1 — Agent A (foundation):** `styles/theme.css`, `styles/globals.css` — tokens + utilities.
- **Wave 2 (after A), disjoint file sets:**
  - **Agent B:** HomeHero, LobbyListTable, LobbyCard, EmptyLobbyState, LobbyListPage.
  - **Agent C:** HowItWorksSection, HomeFeatures, RewardAvatarPromo.
  - **Agent D:** LobbyRoom, SeatGrid, JudgeSlot, LobbyChat, LobbyRoomPage.
- Each agent: tokens only, motion-safe, i18n parity for any new copy, keep tests green.

## Verification

typecheck + tests + build + format:check, i18n key parity across 6 locales, headless-Chrome
visual probe (token/CSS) + logged-in spot check before any deploy.
