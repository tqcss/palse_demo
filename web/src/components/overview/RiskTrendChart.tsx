import { useMemo, useRef, useState } from "react";

import type { TrendDay } from "../../lib/population.ts";
import { RISK_TIERS, TIER_COLOR_VARS, TIER_LABELS } from "../../lib/tiers.ts";
import type { RiskLevel } from "../../lib/patient.ts";

/**
 * "Risk level trend (patients)" — pure SVG line chart (no library):
 * monotone cubic curves so interpolated points never dip below zero, integer
 * y ticks, "Oct 22"-style date labels, tier-colored series, crosshair +
 * tooltip on hover/focus with counts only (no identifiers), a keyboard
 * crosshair (left/right), toggling legend (aria-pressed) and a visually
 * hidden data table as the screen-reader fallback.
 */

const W = 560;
const H = 210;
const PAD = { top: 14, right: 14, bottom: 26, left: 34 };

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const FULL_DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Fritsch–Carlson monotone cubic → smooth path that never overshoots. */
function monotonePath(points: Array<{ x: number; y: number }>): string | null {
  const n = points.length;
  if (n === 0) return null;
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const d = points[i + 1].x - points[i].x;
    dx.push(d);
    slope.push((points[i + 1].y - points[i].y) / d);
  }

  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] * dx[i] + slope[i] * dx[i - 1]) / (dx[i] + dx[i - 1]);
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    path += ` C ${points[i].x + h} ${points[i].y + (m[i] * dx[i]) / 3}, ${points[i + 1].x - h} ${
      points[i + 1].y - (m[i + 1] * dx[i]) / 3
    }, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return path;
}

export default function RiskTrendChart({ data }: { data: TrendDay[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<RiskLevel>>(new Set());
  const [crosshair, setCrosshair] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const visible = RISK_TIERS.filter((tier) => !hidden.has(tier));

  const chart = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = data.length;
    const maxCount = Math.max(0, ...data.map((d) => Math.max(...RISK_TIERS.map((t) => d.counts[t]))));
    const yMax = niceCeil(maxCount) || 5;

    const xScale = (i: number) => PAD.left + (n < 2 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yScale = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const ticks = tickValues(yMax);

    const paths = new Map<RiskLevel, string | null>();
    for (const tier of RISK_TIERS) {
      paths.set(
        tier,
        monotonePath(data.map((d, i) => ({ x: xScale(i), y: yScale(d.counts[tier]) }))),
      );
    }
    const xLabels = [0, Math.floor((n - 1) / 2), n - 1].filter((i) => i >= 0 && i < n);
    return { xScale, yScale, ticks, paths, xLabels, innerW, innerH, yMax };
  }, [data]);

  /* Empty state: nothing at all for a month. */
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return (
      <div className="flex h-44 items-center justify-center rounded-control border border-dashed border-theme-line bg-theme-light-gray/50 px-6 text-center text-sm text-theme-gray">
        No score history yet — the trend appears once assessments are scored.
      </div>
    );
  }

  const crossDay = crosshair != null ? data[crosshair] : null;

  return (
    <div className="relative">
      {/* Legend: toggles (aria-pressed), shares one risk color mapping. */}
      <div className="mb-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1" aria-label="Series">
        {RISK_TIERS.map((tier) => {
          const on = !hidden.has(tier);
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(tier)) next.delete(tier);
                  else if (next.size < RISK_TIERS.length - 1) next.add(tier); // keep >=1 visible
                  return next;
                })
              }
              className={[
                "inline-flex min-h-10 items-center gap-1.5 rounded-control px-1.5 text-[11px] font-semibold transition-opacity",
                on ? "" : "opacity-45",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
              ].join(" ")}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: TIER_COLOR_VARS[tier] }}
              />
              <span className="text-theme-ink-soft">{TIER_LABELS[tier]}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={wrapperRef}
        tabIndex={0}
        role="img"
        aria-label="Risk level trend line chart. Use left and right arrow keys to move the crosshair; a visually hidden data table follows."
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 1 : -1;
          setCrosshair((current) => {
            const base = current ?? (delta === 1 ? -1 : data.length);
            return Math.min(data.length - 1, Math.max(0, base + delta));
          });
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setCrosshair(null);
        }}
        onPointerMove={(event) => {
          const rect = wrapperRef.current?.getBoundingClientRect();
          if (rect == null) return;
          const x = event.clientX - rect.left;
          const innerW = rect.width - (PAD.left / W) * rect.width - (PAD.right / W) * rect.width;
          const idx = Math.round(((x - (PAD.left / W) * rect.width) / innerW) * (data.length - 1));
          setCrosshair(Math.min(data.length - 1, Math.max(0, idx)));
        }}
        onPointerLeave={() => setCrosshair(null)}
        className="relative w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {/* Y grid: integer ticks */}
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={chart.yScale(tick)}
                y2={chart.yScale(tick)}
                stroke="var(--color-theme-line)"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text
                x={PAD.left - 8}
                y={chart.yScale(tick) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-theme-gray)"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* X labels: first / middle / last */}
          {chart.xLabels.map((i) => (
            <text
              key={i}
              x={chart.xScale(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--color-theme-gray)"
            >
              {formatDay(data[i].day)}
            </text>
          ))}

          {/* Crosshair */}
          {crossDay ? (
            <line
              x1={chart.xScale(crosshair ?? 0)}
              x2={chart.xScale(crosshair ?? 0)}
              y1={PAD.top - 6}
              y2={H - PAD.bottom}
              stroke="var(--color-theme-maroon)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          ) : null}

          {/* Series */}
          {RISK_TIERS.map((tier) =>
            hidden.has(tier) ? null : (
              <path
                key={tier}
                d={chart.paths.get(tier) ?? undefined}
                fill="none"
                stroke={TIER_COLOR_VARS[tier]}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ),
          )}

          {/* Day hit targets (invisible) + points on hover */}
          {RISK_TIERS.map((tier) =>
            hidden.has(tier) || crossDay == null ? null : (
              <circle
                key={`pt-${tier}`}
                cx={chart.xScale(crosshair ?? 0)}
                cy={chart.yScale(crossDay.counts[tier])}
                r={3.5}
                fill={TIER_COLOR_VARS[tier]}
                stroke="var(--color-theme-white)"
                strokeWidth={1.5}
              />
            ),
          )}
        </svg>

        {/* Threshold-friendly tooltip anchored to the crosshair */}
        {crossDay ? (
          <div
            className="pointer-events-none absolute top-2 z-[var(--z-dropdown)] -translate-x-1/2 rounded-control border border-theme-line bg-white px-2.5 py-1.5 text-[11px] shadow-card"
            style={{
              left: `${Math.min(88, Math.max(12, ((chart.xScale(crosshair ?? 0)) / W) * 100))}%`,
            }}
          >
            <div className="font-bold text-theme-ink">{formatDayFull(crossDay.day)}</div>
            <div className="mt-0.5 flex flex-col gap-0.5">
              {visible.map((tier) => (
                <span key={tier} className="flex items-center gap-1.5 text-theme-ink-soft">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: TIER_COLOR_VARS[tier] }}
                  />
                  {TIER_LABELS[tier]}: {crossDay.counts[tier]}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Screen-reader fallback table. */}
      <table className="sr-only">
        <caption>Risk level trend, patients per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {RISK_TIERS.map((tier) => (
              <th scope="col" key={tier}>
                {TIER_LABELS[tier]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.day}>
              <th scope="row">{formatDayFull(row.day)}</th>
              {RISK_TIERS.map((tier) => (
                <td key={tier}>{row.counts[tier]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p aria-hidden className="sr-only">
        {focused ? "Crosshair keyboard navigation active." : ""}
      </p>
    </div>
  );
}

/** "Oct 22" axis labels. */
function formatDay(iso: string): string {
  return DAY_LABEL_FORMAT.format(new Date(`${iso}T12:00:00`));
}

/** Unambiguous full date for tooltips and the sr table ("Wed, Nov 3, 2026"). */
function formatDayFull(iso: string): string {
  return FULL_DAY_FORMAT.format(new Date(`${iso}T12:00:00`));
}

function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000];
  for (const step of steps) if (value <= step) return step;
  return Math.ceil(value / 1000) * 1000;
}

function tickValues(max: number): number[] {
  if (max === 0) return [0];
  const count = max <= 8 ? max : Math.min(6, Math.ceil(max / 10));
  const step = Math.max(1, Math.ceil(max / count));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}
