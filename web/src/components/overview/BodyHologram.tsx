import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import MsIcon from "../MsIcon.tsx";
import { BODY_SYSTEMS, type BodySystem } from "../../content/bodySystems.ts";
import { CITATIONS } from "../../content/riskOverview.ts";

/**
 * The hologram view of the "Sepsis Risk Factors" card: the baby PNG with four
 * interactive body-system hotspots, floating label pills (desktop) or a 2x2
 * label grid + inline details (mobile), and SVG leader lines between them.
 *
 * All geometry lives in bodySystems.ts as percent coordinates, so it scales
 * with the image and is tweakable without touching this component. A
 * ?debugHotspots=1 query flag draws coordinate guides over the image.
 *
 * A11y: each system's hotspot and label are buttons inside ONE roving tab
 * stop (arrow keys move between systems); Enter/Space toggles the detail
 * popover (desktop) or the inline panel (mobile). Esc closes and returns
 * focus to the label. Hover never carries information unavailable to
 * keyboard or touch users.
 */

/** Rendered at natural dimensions (explicit, so no layout shift). */
const IMAGE_WIDTH = 1218;
const IMAGE_HEIGHT = 1292;

/* Percent -> SVG-overlay coordinates (overlay shares the image aspect). */
const vx = (x: number) => (x / 100) * IMAGE_WIDTH;
const vy = (y: number) => (y / 100) * IMAGE_HEIGHT;

/** Roving order: hotspots first, then labels — one shared tab stop. */
const ROVING_IDS = BODY_SYSTEMS.flatMap((system) => [
  `hotspot-${system.id}`,
  `label-${system.id}`,
]);

export default function BodyHologram() {
  const [searchParams] = useSearchParams();
  const debug = searchParams.get("debugHotspots") === "1";

  const rootId = useId();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Informational emphasis only — hover/focus mirrors selection but hover is
  // never the only way to reach the details (click/tap/keyboard all work).
  const activeId = hoverId ?? selectedId;

  /* Clicking outside closes the open popover. */
  useEffect(() => {
    if (selectedId == null) return;
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current != null &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setSelectedId(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedId]);

  /* Esc closes and returns focus to the system's label. */
  useEffect(() => {
    if (selectedId == null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const id = selectedId;
      setSelectedId(null);
      document.getElementById(`label-${id}`)?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const selected = useMemo(
    () => BODY_SYSTEMS.find((system) => system.id === selectedId) ?? null,
    [selectedId],
  );

  function toggleSystem(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-[430px] py-2">
      <div
        className="relative w-full"
        style={{ aspectRatio: `${IMAGE_WIDTH} / ${IMAGE_HEIGHT}` }}
        onKeyDown={handleRovingKeys(setFocusIndex)}
      >
        {/* Soft radial maroon glow behind the baby (token-based). */}
        <div
          aria-hidden
          className="absolute inset-x-[6%] top-0 bottom-[2%] rounded-[50%]"
          style={{
            backgroundImage:
              "radial-gradient(closest-side, var(--color-theme-maroon-soft), transparent 74%)",
          }}
        />

        <img
          src="/images/hologram_baby.png"
          alt=""
          aria-hidden
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          decoding="async"
          draggable={false}
          className="relative block h-full w-full select-none opacity-60 saturate-80"
        />

        {/* Leader lines: same viewBox aspect as the box, lines scale with it. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
          className="absolute inset-0 h-full w-full"
        >
          {BODY_SYSTEMS.map((system) => (
            <polyline
              key={system.id}
              points={[
                `${vx(system.hotspot.x)},${vy(system.hotspot.y)}`,
                `${vx(system.leader.x)},${vy(system.leader.y)}`,
                `${vx(system.label.x)},${vy(system.label.y)}`,
              ].join(" ")}
              fill="none"
              stroke="var(--color-theme-maroon)"
              strokeWidth={activeId === system.id ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="transition-opacity duration-200"
              style={{
                opacity: activeId == null || activeId === system.id ? 1 : 0.6,
              }}
            />
          ))}

          {debug
            ? BODY_SYSTEMS.map((system) => (
              <g key={`debug-${system.id}`} className="text-risk-high-fg">
                <line
                  x1={0}
                  y1={vy(system.hotspot.y)}
                  x2={IMAGE_WIDTH}
                  y2={vy(system.hotspot.y)}
                  stroke="currentColor"
                  strokeDasharray="6 6"
                  strokeWidth={1}
                />
                <line
                  x1={vx(system.hotspot.x)}
                  y1={0}
                  x2={vx(system.hotspot.x)}
                  y2={IMAGE_HEIGHT}
                  stroke="currentColor"
                  strokeDasharray="6 6"
                  strokeWidth={1}
                />
                <text
                  x={vx(system.hotspot.x) + 8}
                  y={vy(system.hotspot.y) + 26}
                  fontSize={28}
                  fill="currentColor"
                >
                  {system.id}: {system.hotspot.x},{system.hotspot.y}
                </text>
              </g>
            ))
            : null}
        </svg>

        {/* Floating label pills (>=768px; mobile uses the 2x2 grid below). */}
        <ul className="hidden md:block" aria-label="Body systems">
          {BODY_SYSTEMS.map((system) => {
            const popoverId = `${rootId}-${system.id}`;
            return (
              <li
                key={system.id}
                className="absolute transition-opacity duration-200"
                style={{
                  left: `${system.label.x}%`,
                  top: `${system.label.y}%`,
                  opacity: activeId == null || activeId === system.id ? 1 : 0.6,
                  transform:
                    system.label.side === "right"
                      ? "translateY(-50%)"
                      : "translate(-100%, -50%)",
                  // The open system's pill (and its popover) must paint above
                  // the sibling pills; <li> creates the stacking context, so
                  // the popover's own z-index can't escape it.
                  zIndex:
                    selectedId === system.id
                      ? "var(--z-dropdown)"
                      : selectedId == null || activeId === system.id
                        ? "var(--z-nav)"
                        : undefined,
                }}
              >
                <button
                  id={`label-${system.id}`}
                  type="button"
                  aria-expanded={selectedId === system.id}
                  aria-controls={popoverId}
                  tabIndex={
                    focusIndex === ROVING_IDS.indexOf(`label-${system.id}`)
                      ? 0
                      : -1
                  }
                  aria-label={`${system.name} system`}
                  onClick={() => toggleSystem(system.id)}
                  onMouseEnter={() => setHoverId(system.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(system.id)}
                  onBlur={() => setHoverId(null)}
                  className="flex min-h-10 items-center gap-2 rounded-full border border-theme-line bg-white/90 py-1.5 pl-1.5 pr-3.5 text-xs font-semibold text-theme-ink shadow-card transition-colors hover:border-theme-maroon/40 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-theme-cream">
                    <MsIcon
                      name={system.iconName}
                      className="text-[16px] text-theme-maroon"
                      optical={18}
                    />
                  </span>
                  {system.name}
                </button>

                {selectedId === system.id ? (
                  <SystemPopover
                    system={system}
                    popoverId={popoverId}
                    onClose={() => setSelectedId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {/* Hotspots: dot + pulse on desktop, numbered badge on mobile. */}
        {BODY_SYSTEMS.map((system, index) => (
          <button
            key={`spot-${system.id}`}
            id={`hotspot-${system.id}`}
            type="button"
            aria-expanded={selectedId === system.id}
            aria-controls={`${rootId}-${system.id}`}
            aria-label={`${system.name} system: ${system.signs.join(", ")}`}
            tabIndex={
              focusIndex === ROVING_IDS.indexOf(`hotspot-${system.id}`) ? 0 : -1
            }
            onClick={() => toggleSystem(system.id)}
            onMouseEnter={() => setHoverId(system.id)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(system.id)}
            onBlur={() => setHoverId(null)}
            className="group absolute z-[var(--z-nav)] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity duration-200"
            style={{
              left: `${system.hotspot.x}%`,
              top: `${system.hotspot.y}%`,
              opacity: activeId == null || activeId === system.id ? 1 : 0.6,
            }}
          >
            {/* ≥40px touch target on mobile via padding. */}
            <span
              aria-hidden
              className={
                "grid h-5 w-5 place-items-center rounded-full border-2 border-white shadow-card md:h-3.5 md:w-3.5 " +
                "bg-risk-high-fg transition-transform duration-200 group-hover:scale-125 group-focus-visible:scale-125 " +
                (selectedId === system.id ? "" : "risk-pulse")
              }
            />
            <span
              aria-hidden
              className="absolute grid h-4 w-4 place-items-center rounded-full bg-theme-maroon text-[9px] font-bold text-theme-white md:hidden"
            >
              {index + 1}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile (<768px): inline details for the selected system. */}
      {selected ? (
        <div
          id={`${rootId}-${selected.id}`}
          role="dialog"
          aria-labelledby={`${rootId}-${selected.id}-title`}
          className="mt-4 rounded-card border border-theme-line bg-white p-4 shadow-card md:hidden"
        >
          <SystemDetails
            system={selected}
            titleId={`${rootId}-${selected.id}-title`}
          />
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mt-3 min-h-10 rounded-control border border-theme-line px-4 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            Close
          </button>
        </div>
      ) : null}

      {/* Mobile: 2x2 grid of the same label buttons. */}
      <div
        className="mt-4 grid grid-cols-2 gap-2 md:hidden"
        aria-label="Body systems"
      >
        {BODY_SYSTEMS.map((system, index) => (
          <button
            key={`grid-${system.id}`}
            type="button"
            aria-expanded={selectedId === system.id}
            aria-controls={`${rootId}-${system.id}`}
            tabIndex={
              focusIndex === ROVING_IDS.indexOf(`label-${system.id}`) ? 0 : -1
            }
            onClick={() => toggleSystem(system.id)}
            className={[
              "flex min-h-10 items-center gap-2 rounded-control border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
              selectedId === system.id
                ? "border-theme-maroon bg-theme-maroon-soft text-theme-maroon"
                : "border-theme-line bg-white text-theme-ink hover:border-theme-maroon/40",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
            ].join(" ")}
          >
            <span
              aria-hidden
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-theme-maroon text-[9px] font-bold text-theme-white"
            >
              {index + 1}
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-theme-cream">
              <MsIcon
                name={system.iconName}
                className="text-[14px] text-theme-maroon"
                optical={16}
              />
            </span>
            {system.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Popover anchored under the label pill; only one open at a time. */
function SystemPopover({
  system,
  popoverId,
  onClose,
}: {
  system: BodySystem;
  popoverId: string;
  onClose: () => void;
}) {
  return (
    <div
      id={popoverId}
      role="dialog"
      aria-labelledby={`${popoverId}-title`}
      className={[
        "z-100 absolute top-[calc(100%+8px)] z-[var(--z-dropdown)] w-64 rounded-card border border-theme-line bg-white p-4 text-left shadow-popover",
        system.label.side === "left" ? "left-0" : "right-0",
      ].join(" ")}
    >
      <SystemDetails system={system} titleId={`${popoverId}-title`} />
      <button
        type="button"
        onClick={onClose}
        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-control border border-theme-line px-3 text-xs font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
      >
        <MsIcon name="close" className="text-[16px]" optical={18} />
        Close
      </button>
    </div>
  );
}

/** Shared detail body: signs, why it matters, citation. */
function SystemDetails({
  system,
  titleId,
}: {
  system: BodySystem;
  titleId: string;
}) {
  const citation =
    system.citationKey != null ? CITATIONS[system.citationKey] : null;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-cream">
          <MsIcon
            name={system.iconName}
            className="text-[18px] text-theme-maroon"
            optical={20}
          />
        </span>
        <h3 id={titleId} className="text-sm font-bold text-theme-ink">
          {system.name}
        </h3>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-theme-ink-soft">
        {system.signs.map((sign) => (
          <li key={sign} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-theme-maroon"
            />
            {sign}
          </li>
        ))}
      </ul>
      {/* TODO(clinical-review): wording comes from the content file. */}
      <p className="mt-3 text-xs leading-relaxed text-theme-ink-soft">
        {system.whyItMatters}
      </p>
      {citation ? (
        <p className="mt-2 text-[11px] text-theme-gray">Source: {citation}</p>
      ) : null}
    </div>
  );
}

/** Arrow-key roving over hotspots and labels (one tab stop for the group). */
function handleRovingKeys(
  setFocusIndex: (index: number) => void,
): (event: React.KeyboardEvent<HTMLDivElement>) => void {
  return function onKeyDown(event) {
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowRight",
        "ArrowLeft",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    let nextId: string;
    if (event.key === "Home") {
      nextId = ROVING_IDS[0];
    } else if (event.key === "End") {
      nextId = ROVING_IDS[ROVING_IDS.length - 1];
    } else {
      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const index = ROVING_IDS.indexOf(
        document.activeElement?.id ?? ROVING_IDS[0],
      );
      nextId =
        ROVING_IDS[(index + delta + ROVING_IDS.length) % ROVING_IDS.length];
    }
    setFocusIndex(ROVING_IDS.indexOf(nextId));
    document.getElementById(nextId)?.focus();
  };
}
