# PAL.se design system

The rules that keep the clinical app and the admin console looking and behaving
like one product. Enforced by review; raw colors are enforced by CI
(`bun run check:tokens` in `web/`). Visual reference of every rule:
`/dev/styleguide` (dev builds only).

## 1. Tokens (source of truth)

Everything lives in the `@theme` block of `web/src/index.css`. No hex, rgb or
rgba anywhere else in `web/src` — the only audited exceptions are `index.css`
itself and `lib/report.ts` (a standalone generated print document that cannot
resolve CSS variables).

- **Brand**: `theme-maroon` (+ `-hover`, `-soft` tint), `theme-cream`,
  `theme-white`, `theme-light-gray`, `theme-line`, `theme-gray`,
  `theme-ink`, `theme-ink-soft`, `theme-placeholder`.
- **Risk tiers** (`high | moderate | low | pending`), each with `-bg` (soft tint)
  and `-fg` (dark readable tone). Pending is a muted violet. The TypeScript
  mapping lives in `web/src/lib/tiers.ts` — `RISK_TIERS`, `TIER_LABELS`,
  `TIER_*_CLASSES`, `TIER_COLOR_VARS` (for SVG paint). That one file is the
  single source; `RiskBadge` is the single pill renderer.
- **Semantic aliases**: `success-*` (maps to low tier), `warning-*` (moderate
  tier), `danger-*` (high tier), `info-*` (calm blue). Prefer semantic names in
  components that describe meaning, tier names inぷ risk contexts only.
- **Radii**: `rounded-card` (16px), `rounded-control` (10px), `rounded-full`.
- **Shadows**: `shadow-card` (surfaces), `shadow-popover` (menus/dialogs/popovers
  above chrome).
- **Z layers** (CSS vars): `--z-nav` 30, `--z-dropdown` 40, `--z-modal` 50,
  `--z-toast` 60. Use `z-[var(--z-...)]` until components swallow them.
- **Motion**: 150–200ms ease transitions; `risk-pulse` keyframe for glow pulses.
  `prefers-reduced-motion` is zeroed globally in `index.css`.

## 2. Type scale

Inter 400/500/600/700 only (loaded via @fontsource). Use utility sizes, not
invented values:

| Role | Classes |
|---|---|
| Page title | `text-2xl font-bold text-theme-ink` |
| Card/section title | `text-lg font-bold` (h2) or `text-base font-bold` (h3) |
| Body | `text-sm` in `theme-ink` (primary) / `theme-ink-soft` (informational) |
| Caption/help | `text-xs text-theme-gray` |
| Eyebrow | `text-xs font-semibold(or bold) uppercase tracking-wider text-theme-maroon` |

`theme-gray` on white/cream passes AA for 12px+ semibold or 14px+ regular; for
long informational paragraphs prefer `theme-ink-soft`.

## 3. Layout & responsive rhythm

- Both shells: maroon sidebar (fixed ≥ `md`), slim sticky top bar (`z-20`,
  `px-4 py-3 md:px-8`), content column `max-w-6xl px-4 py-8 md:px-8 md:py-10`.
- Breakpoints as designed: 360 / 768 (`md`) / 1024 / 1280 (`xl`) / 1536.
  768–1024 (bedside tablets) is a first-class target — sidebars, tables and
  drawers switch at `md`.
- Route change behavior (both shells): scroll to top + focus the `<main>`
  landmark; skip link `#app-content` / `#admin-content`.
- Page headers use `ui/PageHeader` (eyebrow + title + subtitle + actions).
  First heading of a page carries `id="page-heading"` for focus handoff.

## 4. Components (`web/src/components/ui/`)

Use these; do not re-implement. Every interactive component must expose:
default, hover, focus-visible (maroon ring), active, disabled, loading
(`Spinner` or `PrimaryButton pending`), error states as applicable.

- **Buttons**: `PrimaryButton` (primary; `inline` prop for headers, `pending`
  flag), plain buttons are border/ghost one-offs — keep them `rounded-control`
  or `rounded-full` (filter pills) with the shared `focus-visible` classes.
  Verbs: Create, Save, Cancel, Delete.
- **Badges**: `ui/Badge` (semantic tones), `RiskBadge` (tier pills — canonical
  tier renderer), StatusPill-style chips map to Badge.
- **Notice** (inline banner roles) / ConfirmDialog for destructive+ sensitive
  actions (plain-language consequence copy).
- **EmptyState**, **Skeleton** (+ `SkeletonCard`, `SkeletonRows`,
  `AdminPageSkeleton`), **Spinner**, **PageHeader**, **Pagination**,
  **CopyButton**, **FilterChips**, **KebabMenu**, **Avatar**, **toast**.
- Data views must have all of: loading (skeleton, not spinner-only), empty
  (icon + helpful CTA), error (+ Retry), and must degrade under
  `#session-expired` gracefully.

## 5. Icons & charts

- Icons only via `MsIcon` (Material Symbols Outlined variable font). Match the
  optical size to the rendered size (`optical={}`). Common sizes: 14/16/18/20/22
  (+36 for illustrated empty states). Body-system names verified to exist:
  `neurology`, `pulmonology`, `ecg_heart`, `gastroenterology`.
- Charts are plain SVG (no chart library). One style: 2px rounded strokes,
  token colors via `TIER_COLOR_VARS`, `theme-line` grid (dashed, 3-4), 11px
  `theme-gray` axis text, shared `formatPercent`/`lib/percent.ts`.
- Never color-only for risk tier: pair color with text (and icon where compact).

## 6. Forms

- Label ABOVE the input; helper text under; inline errors in danger tokens.
- Validate on blur, then on change; show units (weeks, grams); correct
  `inputMode` for numeric fields; submit button disabled + spinner while busy.
- Guard unsaved changes consistently (EditPatient flow is the reference).

## 7. Accessibility baseline

- WCAG AA contrast (see §2 note on `theme-gray`), labels on every input,
  `aria-*` on menus/dialogs/tabs, keyboard operability everywhere, ≥40px touch
  targets on mobile (`min-h-10`), no focus traps (shared `useFocusTrap` handles
  modals; Esc returns focus to trigger), `prefers-reduced-motion` honored.

## 8. Formatting & glossary

- Dates: relative time via `lib/humanTime.ts` (`relativeTime`, `fullTimestamp`
  — "2 Nov 2026, 11:59 PM" day-first); clinical record stamps via
  `lib/patient.ts` (`formatDateLabel`). One canonic unvariant per context.
- Numbers/percent: `lib/percent.ts` always one decimal ("33.3%"), never NaN.
- Sentence case everywhere. Terminology glossary:

| Use | Not |
|---|---|
| patient | client, case, subject |
| assessment | test, exam |
| Cesarean (delivery) | C-section, CS |
| administrator (role) | admin (prose) |
| clinician (persona) | clinician(s) hedging, "users" (prose) |
| Log out | Logout, Sign out |
| Register a patient | Add new patient, create-patient (verb drift) |
| risk tier (per-card text keeps short labels) | score, risk class, category |

## 9. Do / don't

**Do**

- Reach for `components/ui/` first; extend the component, not the page.
- Route change behavior, empty and loading states on day one.
- Put clinical copy in `web/src/content/*` with a
  `TODO(clinical-review)` marker; do not invent citations or statistics.

**Don't**

- Don't hardcode colors/sizes in components; don't add a second button, badge,
  modal or table.
- Don't convey tier by color alone; don't put patient identifiers in the
  analytics DOM (aggregates only).
- Don't bypass `MsIcon` (no raw ligature `<span>`s) and don't use
  non-Inter font weights.
