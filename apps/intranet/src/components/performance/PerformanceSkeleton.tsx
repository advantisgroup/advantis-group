import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full-page loading placeholder for while the Performance session query
 * (`validateSession`) hasn't resolved yet — shown instead of a blank flash.
 * The header shape is generic (role isn't known yet, so it can't show the
 * real admin-only buttons without risking a flash of the wrong ones).
 */
export function PerformancePageSkeleton() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4">
        <Skeleton className="h-6 w-36" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <PerformanceContentSkeleton />
      </main>
    </div>
  );
}

/**
 * Content-area placeholder for once the session is known but a page's own
 * data query (team dashboard, employee detail, drill-down) is still
 * loading — used inside the already-rendered real header.
 */
export function PerformanceContentSkeleton({
  tiles = 6,
  rows = 5,
}: {
  tiles?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: tiles }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
