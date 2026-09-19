import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a heavy route shows while its code loads: the page header's shape, then
 * either rows (lists) or one large block (a calendar or a chart) — close
 * enough to the real page that nothing jumps when it arrives.
 */
export function PageSkeleton({ block = false }: { block?: boolean }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {block ? (
        <Skeleton className="h-[60vh] w-full rounded-xl" />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
