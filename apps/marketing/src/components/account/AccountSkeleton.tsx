import { cn } from "@/lib/utils";

const Bar = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn("block animate-pulse rounded bg-muted", className)} />
);

/**
 * What an account page looks like before its data arrives: a heading, a
 * summary line and a few rows the height of the real ones, so nothing jumps
 * when the page lands.
 */
export function AccountSkeleton({ rows = 4, detail = false }: { rows?: number; detail?: boolean }) {
  return (
    <div role="status" aria-busy className="max-w-3xl">
      <Bar className="h-4 w-24" />
      <Bar className="mt-5 h-9 w-2/3 md:h-10" />
      <Bar className="mt-4 h-4 w-1/2" />
      {detail ? (
        <div className="mt-10 space-y-3">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-4/5" />
          <Bar className="mt-8 h-24 w-full rounded-lg" />
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-rule border-y border-rule">
          {Array.from({ length: rows }, (_, index) => (
            <li key={index} className="py-5 md:py-6">
              <span className="flex justify-between gap-6">
                <Bar className="h-5 w-1/2" />
                <Bar className="h-4 w-16" />
              </span>
              <Bar className="mt-2.5 h-4 w-5/6" />
              <Bar className="mt-3 h-3.5 w-1/3" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
