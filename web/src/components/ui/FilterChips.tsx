import MsIcon from "../MsIcon.tsx";

export interface ActiveFilter {
  id: string;
  label: string;
  onRemove: () => void;
}

/**
 * Removable chips for currently-applied filters ("Category: Accounts ×",
 * "From: 1 Nov ×"). Each chip removes itself with one click/Enter press.
 */
export default function FilterChips({ filters }: { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-theme-gray">
        Filters
      </span>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={filter.onRemove}
          className="group inline-flex items-center gap-1.5 rounded-full border border-theme-line bg-white px-3 py-1 text-xs font-medium text-theme-ink-soft transition-colors hover:border-risk-moderate-fg/40 hover:text-risk-moderate-fg"
          aria-label={`Remove filter: ${filter.label}`}
        >
          {filter.label}
          <MsIcon
            name="close"
            className="text-[13px] text-theme-gray transition-colors group-hover:text-risk-moderate-fg"
            optical={12}
          />
        </button>
      ))}
    </div>
  );
}
