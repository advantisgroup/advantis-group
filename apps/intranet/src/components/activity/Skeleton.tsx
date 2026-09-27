import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for one of ActivityTrack's stat/status cards while it loads. */
export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-1 h-6 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
