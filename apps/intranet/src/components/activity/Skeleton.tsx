const shimmerStyle = {
  // CSS variable resolves per theme, so the shimmer stays visible in dark too.
  backgroundImage:
    "linear-gradient(90deg, transparent 25%, color-mix(in oklch, var(--foreground) 6%, transparent) 50%, transparent 75%)",
  backgroundSize: "800px 100%",
};

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-md bg-panel-2 animate-shimmer ${className}`} style={shimmerStyle} />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-6 w-24 mt-1" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-28" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 rounded-full" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-6 w-16 rounded-md" />
      </td>
    </tr>
  );
}
