/** Skeleton block (pulse) — pages compose these into card/table skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-theme-line/60 ${className ?? ""}`}
    />
  );
}

/** Rectangular skeleton matching the Panel card dimensions. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-card border border-theme-line bg-white p-6 shadow-card ${className ?? ""}`}
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    </div>
  );
}

/** Row-of-bones skeleton for table sections. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

/** Full page fallback shown while a lazy admin route chunk loads. */
export function AdminPageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <SkeletonCard className="min-h-64" />
    </div>
  );
}
