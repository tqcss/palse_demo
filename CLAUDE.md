# CLAUDE.md

Guidance for AI agents working in this repository. Scope: `web/` (React 19 +
Tailwind v4 + Supabase) and `supabase/` (SQL applied manually via the Supabase
SQL editor).

## Project layout

- `web/` — clinical app + admin console (Vite SPA).
- `service/` — FastAPI inference service (the prediction engine).
- `supabase/` — `schema.sql` (canonical, idempotent, applied manually) and
  `migrations/` (newer increments; also applied manually — never assume a
  migrate CLI exists).
- `docs/ui-audit.md` — UI consistency audit with per-item status.

## Commands (run inside `web/`)

```
npx tsc -b --noEmit      # typecheck, must pass
npx oxlint src           # lint, warnings tolerated, errors are not
npx vitest run           # unit tests
npx vite build           # build
npx npm run check:tokens # CI-enforced: no raw hex/rgb in src (tokens only)
```

## UI conventions (normative — see DESIGN_SYSTEM.md for details)

- **Use the shared ui components** in `web/src/components/ui/` (PageHeader,
  Badge, ConfirmDialog, EmptyState, Skeleton, PageHeader, PrimaryButton…).
  Do not add a second button, badge, modal, table, toggle or spinner; if a
  component is missing a state, extend the component.
- **Tokens only, no raw colors.** All colors/radii/shadows come from
  `@theme` in `web/src/index.css` (`theme-*`, `risk-*-bg/fg`,
  `success/warning/danger/info-*`, `rounded-card`, `rounded-control`,
  `shadow-card`, `shadow-popover`). CI fails on raw hex/rgb/rgba in `src/`.
  Tier-class mapping lives in `web/src/lib/tiers.ts`; risk rendering goes
  through `RiskBadge` (pills) or `lib/tiers.ts` (charts/dots). Never
  convey a risk tier with color alone — text/icon is always present.
- **Icons only through `MsIcon`** (Material Symbols). Do not set arbitrary
  `text-[13px]`-style icon sizes; stick to the scale (14/16/18/20/22). Verify
  ligature names exist in the loaded variable font.
- **Required states on every data view**: skeleton while loading (no zeros/
  spinner-only pages), EmptyState with an icon + helpful CTA, error with a
  Retry affordance; disabled+`aria-busy` on async submits.
- **Shells must stay in parity**: maroon sidebar ≥ `md`, sticky top bar
  (`z-20 px-4 py-3 md:px-8`), content `max-w-6xl px-4 py-8 md:px-8 md:py-10`,
  skip link, scroll-to-top + focus-to-`<main>` on route change, titles via
  `usePageTitle("X")` / `useAdminPageTitle("X")` ("X — Pal.se[ Admin]").
  Breakpoints: 360 / 768 / 1024 / 1280 / 1536; tablets (768–1024) first-class.
- **Sentence case + glossary** (patient, assessment, Cesarean, administrator).
  One date style per format context (`lib/humanTime.ts` relative/day-first;
  `lib/patient.ts` stamps). Percentages via `lib/percent.ts` (one decimal,
  total=0 never NaN).
- **Destructive or sensitive actions** always go through `ui/ConfirmDialog`
  with plain-language consequence copy.
- **Clinical copy** goes in `web/src/content/*` marked
  `TODO(clinical-review)`. Never invent citations or statistics.
- **Privacy**: analytics/aggregates must not put patient names, MRNs or any
  identifier in the DOM, logs or queries.

## Supabase rules

- No client-supplied org id anywhere; org isolation is server-side via RLS
  (`current_org_id()`), and new RPCs are `stable` + `security invoker`.
- Hand-written row types live in `web/src/lib/db.ts` / `patient.ts`; do not
  expect generated database.types.
- New SQL goes into `supabase/migrations/` (timestamped, idempotent,
  `create or replace`), summarize usage in the file header like schema.sql.
- Tier vocabulary: `pending | low | moderate | high`;
  `assessments.prediction->>'risk_label'` carries legacy
  "HIGH/MODERATE/LOW RISK" labels; `predicted_at` null = not yet scored.
