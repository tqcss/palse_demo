# PAL.SE UI consistency audit

> Presentation/interaction consistency review. Hard rules respected: no
> business logic, API contracts, auth, tenant isolation or prediction-workflow
> changes.
>
> **Status legend:** `Open` · `Fixed` · `Won't fix (rationale)`
>
> Last updated: 2026-11-03 (branch `feat/risk-overview-and-ui-consistency`)

## 1. Colors and arbitrary values

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Dashboard scored donut | `web/src/pages/Dashboard.tsx:1457–1461` | `DONUT_COLORS` hardcodes the tier hexes (`#b42318`, `#9a5b00`, `#1f7a45`) duplicating `@theme` | Med | Use `var(--color-risk-*-fg)` in the SVG/conic paint | Fixed |
| Dashboard donut fallback | `Dashboard.tsx:1505` | `var(--color-theme-line, #e5e7eb)` — wrong fallback hex | Low | Remove fallback; token exists | Fixed |
| Notice component | `components/Notice.tsx:6,8` | `sky-*` / `amber-*` Tailwind palette for info/warning instead of tokens | Med | Map to `--color-info-*` / `--color-warning-*` semantic tokens | Fixed |
| Info badge | `components/ui/Badge.tsx:10` | `sky-300/40 bg-sky-50 text-sky-900` | Med | `info` metric tokens | Fixed |
| Static report PDF/HTML | `lib/report.ts:120–190` | Entire palette duplicated as hex inside a standalone generated doc | Low | **Won't fix now**: standalone, go-pdf/jsPDF artifacts can't resolve CSS vars; documented in DESIGN_SYSTEM as exception | Won't fix |
| SideCover ghost | `components/SideCover.tsx:12` | `rgba(251,79,79,0.4)` ghost-red not from the palette | Low | Replace with token-based tint | Fixed |
| 404 ghost size | `pages/NotFound.tsx:59` | `md:text-72` — not a Tailwind class (silently ignored) | Low | Use a real arbitrary size | Fixed |
| Auth brands | `components/AuthFormShell.tsx:24`, `components/NotFound.tsx:29–52` | rgba() brand tints for gradients | Low | Acceptable one-off heat; documented; side-cover shadow is structural | Won't fix |
| Pending tier | `components/RiskBadge.tsx`, `pages/ReportsPage.tsx` | Pending styled ad-hoc differently 3× | High | `--color-risk-pending-bg/fg` added to `@theme`; `lib/tiers.ts` is single mapping | Fixed |
| Dashboard top section | `components/overview/*` (new) | Built before tokens existed for pending/semantic info | Info | New section was built token-only from day 1 on this branch | Fixed |

## 2. Duplicate components

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Primary button | `components/PrimaryButton.tsx` vs 6+ one-off `bg-theme-maroon` buttons (`PatientsPage.vue:119/416`, `ReportsPage:142`, `EditPatientPage:240`, `NotFound:85`, `AdminNotFound:31`) | Same button re-implemented; mixes `rounded-lg` (8px) and `rounded-control` (10px) | High | Keep `PrimaryButton` as the canonical primary; normalize to `rounded-control`; swap one-off call sites | Partial |
| Badge/pill | `RiskBadge` vs `ui/Badge` vs inline status pills (`Dashboard:1522`, `MonitorPage:614,723`, `ReportsPage:412–424`) | Two pill components + inline re-implementations | High | `RiskBadge` consumes `lib/tiers.ts` (single mapping); `ui/Badge` stays for status tones; inline pills migrated | Partial |
| Card shells | `components/Panel.tsx` (`rounded-xl shadow-sm`) vs `ui/*` (`rounded-card shadow-card`) vs admin tables | Two card languages | Med | Panel → token pair (visual change approved within consistency scope) | Fixed |
| Spinner | `ui/Spinner.tsx` vs inline spans in `PrimaryButton`, `Dashboard:1426`, `PatientsPage:212` | Consistent internals, 4 implementations | Low | Inline spans now use identical border classes; component consolidation tracked later | Open |
| Stat card | `components/StatCard.tsx` (auth-only) vs local `StatCard` in `ReportsPage:379` & `AdminOverviewPage:45` | Three StatCards, only one exported | Med | Local ones now visually aligned via panel tokens; full merge in follow-up | Open |
| Confirm flows | `ui/ConfirmDialog.tsx` vs ad-hoc delete modal in `PatientsPage:188–222` | Two confirmation patterns | Med | PatientsDelete adopts ConfirmDialog | Partial |

## 3. Page structure and layout

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Page header | Clinical pages hand-roll `<header>` (`Dashboard:536`, `PatientsPage:103`, `ReportsPage:124`, `MonitorPage`) vs `ui/PageHeader.tsx` (admin) | Eyebrow style differs (`font-bold tracking-wide` vs `font-semibold tracking-wider`); admin gets focusable h1 | High | Clinical pages adopt `ui/PageHeader` (skip Dashboard's in-wizard header, which is a section header, not a page header) | Partial |
| Top bar paddings/width | `components/AppTopbar.tsx` (`px-5` + inner `max-w-[68em]`, z-10, label-as-link) vs admin `AdminLayout.tsx` (`px-4`, z-20, h2, no inner width) | Shell drift between the two consoles | High | Align paddings, z; keep both max-widths aligned to content (`max-w-6xl`) | Fixed |
| Sidebar | Clinical `AppSidebar` (w-60, shows ≥ md, `rounded-lg` items) vs `AdminLayout` (w-64, shows ≥ lg, `rounded-control`) | Breakpoint + item radius differ | Med | Admin sidebar now shows ≥ md and uses `rounded-control` everywhere; widths kept (300/256px) — intentional, documented | Fixed |
| Route change focus | Admin has scroll-to-top + `main.focus()` (`AdminLayout:53–63`); clinical shell has nothing | Keyboard users lose context on route change in the clinical app | High | Same effect added to the clinical `AppLayout` | Fixed |
| Skip link | Admin only | Screen-reader users had no skip link clinically | Med | Added to clinical AppLayout | Fixed |
| Doc title format | `usePageTitle("X — Pal.se")` vs `useAdminPageTitle("X · PAL.SE Admin")` | Casing + separator differ | Low | Unified to `X — Pal.se` / `X — Pal.se Admin` | Fixed |

## 4. Icons and data visualization

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Icon sizes | ~40 `text-[14..36px]` MsIcon sizes, no scale | Drift everywhere | Low | Documented scale (ize set: 14/16/18/20/22/28) in DESIGN_SYSTEM; no functional change | Open |
| Risk color mapping | `RiskBadge` vs new `lib/tiers.ts` vs `Dashboard.DONUT_COLORS` vs `ReportsPage.TIER_COLORS` | 4 mappings | High | `lib/tiers.ts` is now the single source; RiskBadge consumes it | Fixed |
| Donut/chart style | old conic donut (Dashboard), CSS bars (Reports), `TrendChart` (Monitor), new `RiskDonut`/`RiskTrendChart` | Mixed techniques/strokes | Med | Document now; the new section follows one chart style; legacy charts migrate incrementally | Open |

## 5. Terminology, dates, numbers, microcopy

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Relative time | `lib/humanTime.ts:44` | "6 weeks ago" claimed in docs but missing weeks bucket (`days < 45` jumps to months) | Med | Added weeks bucket (14–45 days) | Fixed |
| Date formats | `lib/patient.ts` (US "Jan 24, 2026") vs `lib/humanTime.ts` (day-first "2 Nov 2026") | Two conventions | Med | Documented: relative → humanTime, daily axis/clinical stamps → patients.ts; unification of absolute lists is scheduled behind the glossary | Open |
| Terminology | app-wide | "Logout/Log out" (fixed earlier), "Administrator sign in" vs "admin console", "Use of ⚠️ manual risk level" | Med | Glossary created in `DESIGN_SYSTEM.md`; drift reported | Open |

## 6. States and accessibility

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Loading skeletons | `PatientsPage:379` / `ReportsPage:156` hand-rolled pulses vs `ui/Skeleton` (admin) | Duplicate pulse blocks | Med | Clinical pages adopt `ui/Skeleton` | Partial |
| Empty states | `PatientsPage:392` uses `Panel`; `ReportsPage:222` plain text; none use `ui/EmptyState` (admin-only) | 3 empty-state languages | Med | Adopt `ui/EmptyState` clinically (Dashboard section already ships proper empty/zero states) | Partial |
| Error boundary | AdminSection only (`App.tsx:43–49`); clinical routes unprotected | A rendering crash blanks the whole clinical pane | High | Clinical routes wrapped with ErrorBoundary in App | Fixed |
| Icon-only controls | `RowAction` in `PatientsPage` (text ok), `KebabMenu` fine | OK | — | — | OK |
| Charts a11y | New section adds aria labels + sr tables; legacy TrendChart OK | OK | — | — | OK |

## 7. New-section guardrails (this branch)

| Area | File(s) | Inconsistency | Severity | Fix | Status |
|---|---|---|---|---|---|
| Guardrail script | — | Nothing stops new hardcodes | High | `npm run check:tokens` scans `src/` for hex/rgb/rgba | Fixed |
| Styleguide | — | No component gallery exists | Med | Dev-only `/dev/styleguide` route renders tokens, type scale, tiers, icons and every ui component state | Fixed |
| Documentation | — | No design-system or conventions doc | High | `DESIGN_SYSTEM.md` + `CLAUDE.md` UI conventions section | Fixed |

## Summary of what is NOT fixed (needs a product/clinical decision)

- The global palette of **info blue** (#2c6486) is new to the token set — branding
  sign-off requested in the summary.
- Documented **absolute date formats** differ between clinical and admin files;
  aligning them changes visible copy everywhere — scheduled, needs sign-off.
- Insight/statistics **wording from the mockup** is marked
  `TODO(clinical-review)` in `web/src/content/riskOverview.ts`.
- Full local-chart migration (Reports bars, monitor chart) — mechanical, left as
  follow-up to keep this pass reviewable.
