import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

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

export interface AvatarStackPerson {
  id: string;
  name: string;
  avatar?: string | null;
  /** Extra line shown in the hover tooltip, e.g. a Clerk user id. */
  detail?: string;
}

/**
 * GitHub-style overlapping avatar row: shows up to `max` avatars, each with
 * its own hover tooltip (name + `detail`), and collapses the rest into a
 * "+N" chip whose tooltip lists everyone who didn't fit.
 */
export function AvatarStack({
  people,
  max = 5,
  size = "size-7",
  onSelect,
  className,
}: {
  people: AvatarStackPerson[];
  max?: number;
  size?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.slice(max);

  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {visible.map(p => (
        <Tooltip key={p.id}>
          <TooltipTrigger asChild>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="relative rounded-full ring-2 ring-card transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-none"
              >
                <Avatar className={size}>
                  {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                  <AvatarFallback className="text-[10px]">
                    {initials(p.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <Avatar className={cn(size, "relative ring-2 ring-card")}>
                {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                <AvatarFallback className="text-[10px]">
                  {initials(p.name)}
                </AvatarFallback>
              </Avatar>
            )}
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="font-medium">{p.name}</p>
            {p.detail && <p className="text-muted-foreground">{p.detail}</p>}
          </TooltipContent>
        </Tooltip>
      ))}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                size,
                "relative z-0 flex shrink-0 cursor-default items-center justify-center rounded-full border border-border bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card"
              )}
            >
              +{overflow.length}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] p-2">
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {overflow.map(p => (
                <li key={p.id} className="flex items-center gap-2">
                  <Avatar className="size-5 shrink-0">
                    {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                    <AvatarFallback className="text-[8px]">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{p.name}</span>
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
