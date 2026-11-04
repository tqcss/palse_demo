import { useState } from "react";

import MsIcon from "../components/MsIcon.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import RiskBadge from "../components/RiskBadge.tsx";
import Badge from "../components/ui/Badge.tsx";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import PageHeader from "../components/ui/PageHeader.tsx";
import { Skeleton } from "../components/ui/Skeleton.tsx";
import Spinner from "../components/ui/Spinner.tsx";
import { RISK_TIERS, TIER_BG_CLASSES, TIER_FG_CLASSES } from "../lib/tiers.ts";

/**
 * DEV-ONLY component gallery for visual QA — routed at /dev/styleguide and
 * gated on import.meta.env.DEV, so the chunk is never bundled/requested in a
 * production build. Shows tokens, the type scale, tiers, icons and the ui
 * components in their defined states (default/hover/focus/disabled/loading).
 *
 * Rules demonstrated here are normative in DESIGN_SYSTEM.md and CLAUDE.md.
 */

const ICON_NAMES = [
  "dashboard", "group", "history", "apartment", "medical_services", "logout",
  "search", "filter_list", "settings", "person", "monitoring", "insights",
  "info", "error", "refresh", "delete", "close", "menu", "arrow_forward",
  "chevron_right", "check_circle", "warning", "ecg_heart", "neurology",
  "pulmonology", "gastroenterology", "graphic_eq", "bloodtype", "schedule",
];

export default function Styleguide() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col gap-10 bg-theme-light-gray px-6 py-10">
      <PageHeader
        eyebrow="Dev only"
        title="Styleguide"
        subtitle="Tokens, type scale, risk tiers, icons and ui components in every state. Not shipped to production builds."
      />

      {/* ------------------------------ colors ------------------------------ */}
      <Panel title="Color tokens" subtitle="Only these may appear; raw hex/rgb in src fails check:tokens.">
        <div className="flex flex-col gap-6">
          <SwatchRow
            label="Brand"
            items={[
              ["theme-maroon", "bg-theme-maroon"], ["theme-maroon-hover", "bg-theme-maroon-hover"],
              ["theme-maroon-soft", "bg-theme-maroon-soft"], ["theme-cream", "bg-theme-cream"],
            ]}
          />
          <SwatchRow
            label="Surfaces & text"
            items={[
              ["theme-white", "bg-theme-white"], ["theme-light-gray", "bg-theme-light-gray"],
              ["theme-line", "bg-theme-line"], ["theme-gray", "bg-theme-gray"],
              ["theme-ink", "bg-theme-ink"], ["theme-ink-soft", "bg-theme-ink-soft"],
            ]}
          />
          <SwatchRow
            label="Semantic"
            items={[
              ["success-bg/fg", "bg-success-bg"], ["warning-bg/fg", "bg-warning-bg"],
              ["danger-bg/fg", "bg-danger-bg"], ["info-bg/fg", "bg-info-bg"],
            ]}
          />
        </div>
      </Panel>

      {/* ------------------------------ tiers ------------------------------- */}
      <Panel title="Risk tiers" subtitle="Single mapping lives in lib/tiers.ts; never color-only — text is always paired.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RISK_TIERS.map((tier) => (
            <div key={tier} className={`rounded-card border p-4 ${TIER_BG_CLASSES[tier]}`}>
              <RiskBadge level={tier} />
              <p className={`mt-3 text-xs font-semibold ${TIER_FG_CLASSES[tier]}`}>
                {tier} — also used for dots, donuts, charts, legends.
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* --------------------------- type scale ----------------------------- */}
      <Panel title="Type scale" subtitle="Inter 400/500/600/700 only. Eyebrow = maroon, uppercase, tracked.">
        <div className="flex flex-col gap-3">
          <p className="text-3xl font-bold text-theme-ink">Heading / display — 30px bold</p>
          <h1 className="text-2xl font-bold text-theme-ink">Page title — 24px bold</h1>
          <h2 className="text-lg font-bold text-theme-ink">Card title — 18px bold</h2>
          <p className="text-sm text-theme-ink">Body — 14px regular (theme-ink)</p>
          <p className="text-sm text-theme-ink-soft">Body soft — 14px (theme-ink-soft)</p>
          <p className="text-xs text-theme-gray">Caption — 12px (theme-gray, AA-checked)</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-theme-maroon">Eyebrow label</p>
        </div>
      </Panel>

      {/* ------------------------------ icons ------------------------------- */}
      <Panel title="Material Symbols" subtitle="Via MsIcon only; one family, optical-size matched. Sizes: 14/16/18/20/22+">
        <div className="grid grid-cols-4 gap-3 text-center sm:grid-cols-7">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1 rounded-control border border-theme-line p-2">
              <MsIcon name={name} className="text-[20px] text-theme-ink" optical={20} />
              <span className="truncate text-[10px] text-theme-gray" title={name}>{name}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------------------------- components ---------------------------- */}
      <Panel title="Buttons" subtitle="primary (PrimaryButton) · Keyword: Create, Save, Cancel, Delete — sentence case.">
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="button" inline>Create patient</PrimaryButton>
          <PrimaryButton type="button" inline pending>Saving…</PrimaryButton>
          <PrimaryButton type="button" inline disabled>Disabled</PrimaryButton>
        </div>
      </Panel>

      <Panel title="Badges, notices & status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="maroon">maroon</Badge>
          <Badge tone="success" icon="check_circle">success</Badge>
          <Badge tone="warning" icon="warning">warning</Badge>
          <Badge tone="danger" icon="error">danger</Badge>
          <Badge tone="info" icon="info">info</Badge>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Notice tone="info">info notice</Notice>
          <Notice tone="success">success notice</Notice>
          <Notice tone="warning">warning notice</Notice>
          <Notice tone="danger">danger notice</Notice>
        </div>
      </Panel>

      <Panel title="Loading, empty & error states" subtitle="Every data view gets all three. Skeleton first (no shift), EmptyState with CTA, error with Retry.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-card border border-theme-line p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-theme-gray">Skeleton</p>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-14" />
          </div>
          <div className="rounded-card border border-theme-line p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-theme-gray">Empty</p>
            <EmptyState icon="search_off" title="Nothing here" body="Helpful sentence explaining what to do next." />
          </div>
          <div className="rounded-card border border-theme-line p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-theme-gray">Spinner</p>
            <Spinner /><Spinner className="ml-2" /><Spinner inverted className="ml-2 bg-theme-maroon" />
          </div>
        </div>
      </Panel>

      <Panel title="Confirm dialog" subtitle="Required for every destructive/sensitive action; plain-language consequence.">
        <PrimaryButton type="button" inline onClick={() => setConfirmOpen(true)}>
          Open confirm dialog
        </PrimaryButton>
      </Panel>

      {confirmOpen ? (
        <ConfirmDialog
          title="Delete demo data"
          destructive
          question={<p>Deletes the demo record including its assessments. This cannot be undone.</p>}
          confirmLabel="Delete"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SwatchRow({ label, items }: { label: string; items: Array<[string, string]> }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-theme-gray">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(([name, className]) => (
          <div key={name} className="w-32 rounded-control border border-theme-line p-2">
            <span className={`block h-8 rounded-[6px] ${className}`} />
            <span className="mt-1 block text-[10px] text-theme-gray">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
