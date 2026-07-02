import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Group conversation avatar. Renders, in priority order:
 *   1. a custom group photo (`src`), else
 *   2. a square collage of up to four member photos (empty cells fall back to
 *      the member's initials), else
 *   3. the group-name initials.
 * Groups are square (rounded) to read distinctly from the circular DM avatars.
 */
export function GroupAvatar({
  src,
  memberAvatars = [],
  memberNames = [],
  name,
  className,
}: {
  src?: string | null;
  memberAvatars?: (string | null)[];
  memberNames?: string[];
  name: string;
  className?: string;
}) {
  const base = cn(
    "relative shrink-0 overflow-hidden rounded-[30%] border border-border bg-muted",
    className
  );

  if (src) {
    return (
      <span className={base}>
        <img src={src} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  const cells = memberAvatars.slice(0, 4).map((avatar, i) => ({
    avatar,
    name: memberNames[i] ?? "",
  }));

  // No members to collage — plain group-name initials.
  if (cells.length === 0) {
    return (
      <span
        className={cn(
          base,
          "flex items-center justify-center text-xs font-medium text-foreground"
        )}
      >
        {initials(name)}
      </span>
    );
  }

  // Layout tuned per member count (2 side-by-side, 3 = one tall + two stacked,
  // 4 = 2×2). The wrapper fills the square; `bg-border` shows as hairline gaps.
  const layout =
    cells.length === 1
      ? "grid-cols-1 grid-rows-1"
      : cells.length === 2
        ? "grid-cols-2 grid-rows-1"
        : "grid-cols-2 grid-rows-2";

  return (
    <span className={base}>
      <span className={cn("grid h-full w-full gap-px bg-border", layout)}>
        {cells.map((c, i) => (
          <span
            key={i}
            className={cn(
              "flex items-center justify-center overflow-hidden bg-muted text-[9px] font-semibold text-muted-foreground",
              // With exactly 3 members, the first one takes the full left column.
              cells.length === 3 && i === 0 && "row-span-2"
            )}
          >
            {c.avatar ? (
              <img
                src={c.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials(c.name)
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
