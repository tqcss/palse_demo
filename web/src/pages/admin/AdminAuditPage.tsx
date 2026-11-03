import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import FormInput from "../../components/FormInput.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import Badge, { type BadgeTone } from "../../components/ui/Badge.tsx";
import CopyButton from "../../components/ui/CopyButton.tsx";
import EmptyState from "../../components/ui/EmptyState.tsx";
import FilterChips from "../../components/ui/FilterChips.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import Pagination from "../../components/ui/Pagination.tsx";
import { SkeletonRows } from "../../components/ui/Skeleton.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";
import { guide } from "../../lib/authErrors.ts";
import { fullTimestamp, relativeTime } from "../../lib/humanTime.ts";
import {
  type AuditCategory,
  type AuditLogEntry,
  type AuditLogFilter,
  auditCategoryMeta,
  describeAuditEntry,
  exportAuditLogs,
  knownAuditActions,
  listAuditLogsPage,
} from "../../lib/admin.ts";

const PAGE_SIZE = 25;

type Preset = "" | "today" | "7d" | "30d" | "custom";

const CATEGORIES: AuditCategory[] = [
  "patient",
  "assessment",
  "vitals",
  "account",
  "organization",
  "password_reset",
];

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  patient: "Patients",
  assessment: "Assessments",
  vitals: "Vitals",
  account: "Accounts",
  organization: "Organization",
  password_reset: "Password resets",
};

/** Badge tones per category (palette-consistent soft tint/dark-fg pairs). */
const CATEGORY_TONES: Record<AuditCategory, { tone: BadgeTone }> = {
  patient: { tone: "success" },
  assessment: { tone: "warning" },
  vitals: { tone: "info" },
  account: { tone: "maroon" },
  organization: { tone: "neutral" },
  password_reset: { tone: "danger" },
};

/**
 * Audit console: the server-recorded, org-scoped activity trail. Filters,
 * presets and pagination live in the URL; rows expand into a readable JSON
 * block; the filtered view exports to CSV.
 */
export default function AdminAuditPage() {
  useAdminPageTitle("Audit log");
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  /* --------------------------------- URL state ------------------------------ */
  const category = getC(searchParams.get("category"));
  const action = searchParams.get("action") ?? "";
  const actor = searchParams.get("actor") ?? "";
  const preset = getP(searchParams.get("preset"));
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  function getC(value: string | null): AuditCategory | "" {
    return CATEGORIES.includes(value as AuditCategory) ? (value as AuditCategory) : "";
  }
  function getP(value: string | null): Preset {
    return (["", "today", "7d", "30d", "custom"] as const).includes(value as Preset)
      ? (value as Preset)
      : "";
  }

  /* draft filter inputs (applied through the Apply button) */
  const [draftOpen, setDraftOpen] = useState(() =>
    category !== "" || action !== "" || actor !== "" || preset !== "",
  );
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftAction, setDraftAction] = useState(action);
  const [draftActor, setDraftActor] = useState(actor);
  const [draftPreset, setDraftPreset] = useState(preset);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Keep drafts in sync when URL changes externally (Back/Forward, deep link).
  useEffect(() => {
    setDraftCategory(category);
    setDraftAction(action);
    setDraftActor(actor);
    setDraftPreset(preset);
    setDraftFrom(from);
    setDraftTo(to);
  }, [category, action, actor, preset, from, to]);

  const apply = () => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (draftCategory === "") next.delete("category"); else next.set("category", draftCategory);
        if (draftAction.trim() === "") next.delete("action"); else next.set("action", draftAction.trim());
        if (draftActor.trim() === "") next.delete("actor"); else next.set("actor", draftActor.trim());
        if (draftPreset === "") next.delete("preset");
        else {
          next.set("preset", draftPreset);
          next.delete("from");
          next.delete("to");
        }
        if (draftPreset === "custom") {
          if (draftFrom !== "") next.set("from", draftFrom);
          else next.delete("from");
          if (draftTo !== "") next.set("to", draftTo);
          else next.delete("to");
        } else if (draftPreset === "") {
          next.delete("from");
          next.delete("to");
        }
        next.delete("page");
        return next;
      },
      { replace: false },
    );
  };

  /* --------------------------------- data ---------------------------------- */
  const filter = useMemo<AuditLogFilter>(() => {
    const { fromIso, toIso } = presetBounds(preset, from, to);
    return {
      entity: category === "" ? null : category,
      action: action === "" ? null : action,
      actorEmail: actor === "" ? null : actor,
      fromIso,
      toIso,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [category, action, actor, preset, from, to, page]);

  const [result, setResult] = useState<{ rows: AuditLogEntry[]; total: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await listAuditLogsPage(filter);
        if (active) {
          setResult(next);
          setLoadError(null);
        }
      } catch (cause) {
        if (active) {
          console.error("[palse audit]", cause);
          setLoadError(guide(cause, "Could not load the audit log. Try again."));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [filter]);

  useEffect(() => {
    setExpanded(null);
  }, [filter]);

  /* ------------------------------ CSV export -------------------------------- */
  function buildCsv(rows: AuditLogEntry[]): string {
    const header = ["timestamp", "actor_email", "action", "entity", "entity_id", "details"];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push([
        fullTimestamp(row.created_at),
        row.actor_email ?? "",
        row.action,
        row.entity,
        row.entity_id ?? "",
        describeAuditEntry(row),
      ].map((cell) => escape(String(cell))).join(","));
    }
    return lines.join("\n");
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const rows = await exportAuditLogs({ ...filter, offset: 0 }, 1000);
      if (rows.length === 0) {
        setExportError("Nothing to export with the current filters.");
        return;
      }
      const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `palse-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error("[palse audit export]", cause);
      setExportError(guide(cause, "Could not export the log. Try again."));
    } finally {
      setExporting(false);
    }
  }

  /* ---------------------------------- render -------------------------------- */
  const loading = result == null && loadError == null;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  /** Action suggestions: loaded actions + every known action name. */
  const actionSuggestions = useMemo(() => {
    const set = new Set<string>(knownAuditActions);
    for (const row of result?.rows ?? []) if (row.action) set.add(row.action);
    return [...set];
  }, [result]);

  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; clear: Record<string, null> }> = [];
    if (category !== "") {
      chips.push({ id: "category", label: `Category: ${CATEGORY_LABELS[category]}`, clear: { category: null } });
    }
    if (action !== "") chips.push({ id: "action", label: `Action contains: “${action}”`, clear: { action: null } });
    if (actor !== "") chips.push({ id: "actor", label: `Actor: ${actor}`, clear: { actor: null } });
    if (preset !== "" && preset !== "custom") {
      chips.push({ id: "preset", label: `Period: ${presetLabel(preset)}`, clear: { preset: null } });
    }
    if (preset === "custom" && (from !== "" || to !== "")) {
      chips.push({ id: "custom", label: "Custom period", clear: { preset: null, from: null, to: null } });
    }
    return chips;
  }, [category, action, actor, preset, from, to]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Audit log · Who changed what"
        title="Audit log"
        subtitle="Every clinical and account change in your organization — recorded server-side, so it can't be edited or forged from the app."
        actions={
          <PrimaryButton
            type="button"
            pending={exporting}
            className="w-auto px-4"
            onClick={() => void handleExport()}
          >
            <MsIcon name="download" className="text-[18px]" optical={20} />
            Export CSV
          </PrimaryButton>
        }
      />

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {exportError ? <Notice tone="warning">{exportError}</Notice> : null}

      {activeChips.length > 0 ? (
        <FilterChips
          filters={activeChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            onRemove: () =>
              setSearchParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  for (const key of Object.keys(chip.clear)) next.delete(key);
                  next.delete("page");
                  return next;
                },
                { replace: false },
              ),
          }))}
        />
      ) : null}

      {/* Collapsible filter card */}
      <Panel>
        <button
          type="button"
          aria-expanded={draftOpen}
          onClick={() => setDraftOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-theme-ink">
            <MsIcon name="filter_list" className="text-[18px] text-theme-maroon" optical={20} />
            Filters
            {activeChips.length > 0 ? (
              <Badge tone="maroon">{activeChips.length} active</Badge>
            ) : null}
          </span>
          <MsIcon
            name={draftOpen ? "expand_less" : "expand_more"}
            className="text-theme-gray"
            optical={20}
          />
        </button>

        {draftOpen ? (
          <form
            className="mt-4 grid grid-cols-1 gap-4 border-t border-theme-line pt-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            noValidate
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-theme-gray">Date preset</span>
              <select
                value={draftPreset}
                onChange={(event) => setDraftPreset(getP(event.target.value))}
                className="rounded-control border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
              >
                <option value="">Any period</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom…</option>
              </select>
            </label>

            {draftPreset === "custom" ? (
              <>
                <FormInput
                  id="audit-from"
                  label="From"
                  type="datetime-local"
                  hintClass="hidden"
                  value={draftFrom}
                  onChange={(event) => setDraftFrom(event.target.value)}
                />
                <FormInput
                  id="audit-to"
                  label="To"
                  type="datetime-local"
                  hintClass="hidden"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                />
              </>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-theme-gray">Category</span>
              <select
                value={draftCategory}
                onChange={(event) => setDraftCategory(getC(event.target.value))}
                className="rounded-control border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
              >
                <option value="">All categories</option>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
                ))}
              </select>
            </label>

            <div>
              <FormInput
                id="audit-action"
                label="Action"
                hintClass="hidden"
                name="action"
                placeholder="e.g. assessment.update"
                list="audit-action-suggestions"
                value={draftAction}
                onChange={(event) => setDraftAction(event.target.value)}
              />
              <datalist id="audit-action-suggestions">
                {actionSuggestions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>

            <FormInput
              id="audit-actor"
              label="Actor email"
              hintClass="hidden"
              name="actor"
              placeholder="name@hospital.org"
              value={draftActor}
              onChange={(event) => setDraftActor(event.target.value)}
            />

            <div className="flex items-end gap-3">
              <PrimaryButton className="w-auto px-5">Apply</PrimaryButton>
              <button
                type="button"
                onClick={() => setSearchParams({}, { replace: false })}
                className="rounded-control border border-theme-line px-4 py-2.5 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Clear
              </button>
            </div>
          </form>
        ) : null}
      </Panel>

      <Panel
        title="Activity"
        subtitle={
          result == null
            ? "Loading…"
            : `${result.total} ${result.total === 1 ? "entry" : "entries"}${preset !== "" ? ` — ${presetLabel(preset)}` : ""} · newest first`
        }
      >
        {loading ? (
          <SkeletonRows rows={6} />
        ) : result!.rows.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="No matching activity"
            body="Nothing matches the current filters. Widen the date period or clear a filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-theme-line text-xs uppercase tracking-wider text-theme-gray">
                  <th className="pb-2 pr-4 font-semibold">When</th>
                  <th className="pb-2 pr-4 font-semibold">Category</th>
                  <th className="pb-2 pr-4 font-semibold">What</th>
                  <th className="pb-2 pr-4 font-semibold">Who</th>
                  <th className="pb-2 pr-4 font-semibold">Details</th>
                  <th className="pb-2 font-semibold sr-only">Expand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-line">
                {result!.rows.map((row) => (
                  <AuditRow
                    key={row.id}
                    row={row}
                    me={profile?.id ?? null}
                    meEmail={profile?.email ?? null}
                    expanded={expanded === row.id}
                    onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result != null && result.rows.length > 0 && result.total > PAGE_SIZE ? (
          <div className="mt-4">
            <Pagination
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              onChange={(next) =>
                setSearchParams(
                  (current) => {
                    const nextParams = new URLSearchParams(current);
                    nextParams.set("page", String(next));
                    return nextParams;
                  },
                  { replace: false },
                )
              }
            />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function presetLabel(preset: Preset): string {
  switch (preset) {
    case "today": return "Today";
    case "7d": return "Last 7 days";
    case "30d": return "Last 30 days";
    case "custom": return "Custom period";
    default: return "";
  }
}

/** URL "from"/"to" are datetime-local strings; presets derive bounds locally. */
function presetBounds(preset: Preset, from: string, to: string): { fromIso: string | null; toIso: string | null } {
  const nowIso = new Date().toISOString();
  if (preset === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { fromIso: start.toISOString(), toIso: nowIso };
  }
  if (preset === "7d" || preset === "30d") {
    const days = preset === "7d" ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { fromIso: start.toISOString(), toIso: nowIso };
  }
  if (preset === "custom") {
    const parse = (value: string): string | null => {
      if (value.trim() === "") return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    return { fromIso: parse(from), toIso: parse(to) };
  }
  return { fromIso: null, toIso: null };
}

/* --------------------------------- one row --------------------------------- */

function AuditRow({
  row,
  me,
  meEmail,
  expanded,
  onToggle,
}: {
  row: AuditLogEntry;
  me: string | null;
  meEmail: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const category = auditCategoryMeta(row.entity);
  const tone = CATEGORY_TONES[row.entity];
  const isMe = row.actor_id != null && row.actor_id === me;
  const isMeEmail = !isMe && meEmail != null && row.actor_email === meEmail;

  return (
    <>
      <tr className="align-top transition-colors hover:bg-theme-cream/40">
        <td className="py-3 pr-4 whitespace-nowrap">
          <span title={relativeTime(row.created_at)} className="text-sm text-theme-ink-soft">
            {fullTimestamp(row.created_at)}
          </span>
        </td>
        <td className="py-3 pr-4">
          <Badge tone={tone.tone} icon={category.icon}>{category.label}</Badge>
        </td>
        <td className="py-3 pr-4 font-medium text-theme-ink">{describeAuditEntry(row)}</td>
        <td className="py-3 pr-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {row.actor_email != null ? (
              <Link
                to={`/admin/members?q=${encodeURIComponent(row.actor_email)}`}
                title={`See members matching ${row.actor_email}`}
                className="font-medium text-theme-maroon underline-offset-4 hover:underline"
              >
                {row.actor_email}
              </Link>
            ) : (
              <span title="No actor recorded — performed by the system">
                System
              </span>
            )}
            {isMe || isMeEmail ? (
              <Badge tone="maroon" className="uppercase">You</Badge>
            ) : null}
          </div>
        </td>
        <td className="py-3 pr-4">
          {row.entity_id != null ? (
            <span className="inline-flex max-w-40 items-center gap-1.5">
              <code className="truncate rounded bg-theme-light-gray px-1.5 py-0.5 font-mono text-[11px] text-theme-ink-soft">
                {row.entity_id.slice(0, 8)}
              </code>
              <CopyButton value={row.entity_id} label="ID" tone="plain" className="p-0" />
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="py-3 text-right">
          {(Object.keys(row.metadata ?? {}).length > 0 || expanded) ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse details" : "Expand details"}
              className="rounded-md p-1 text-theme-gray transition-colors hover:bg-theme-line/40 hover:text-theme-ink"
            >
              <MsIcon name={expanded ? "expand_less" : "expand_more"} className="text-[18px]" optical={18} />
            </button>
          ) : (
            <span className="text-xs text-theme-gray">—</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="border-b border-theme-line bg-theme-light-gray/60 px-6 py-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-theme-ink-soft">
                {fullTimestamp(row.created_at)} — {describeAuditEntry(row)} (operation{" "}
                <code className="font-mono text-xs">{String(row.metadata?.op ?? "?" )}</code>)
              </p>
              <pre className="max-h-56 overflow-auto rounded-control border border-theme-line bg-white p-3 font-mono text-[11px] leading-relaxed text-theme-ink-soft">
                {JSON.stringify(row.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
