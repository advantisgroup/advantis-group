"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { teamColor, teamLabelKey } from "@/lib/teams";

export type PersonRole = "admin" | "manager" | "employee";

/**
 * Consistent role/department/team badge row, shared by the three "list of
 * people" surfaces (Directory, Admin Members, Activity People roster) so
 * they stop each showing a different subset of the same fields. Each caller
 * still owns its own layout/actions around this — only the identity badges
 * are shared.
 *
 * Department and team tags are capped at `maxTags` and collapsed into a
 * "+N" badge beyond that, so the row stays short and wraps at most once
 * regardless of how many teams a person has — keeping card/row heights
 * roughly consistent. Callers must let the row wrap (no `overflow-hidden` /
 * `flex-nowrap`): badges are `shrink-0`, so clipping the container instead
 * of wrapping slices a badge in half rather than hiding it.
 */
export function PersonIdentityBadges({
  role,
  department,
  teams,
  className,
  maxTags = 1,
}: {
  role?: PersonRole;
  department?: string | null;
  teams?: readonly string[];
  className?: string;
  maxTags?: number;
}) {
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");

  const tags: { key: string; label: string; dotClassName?: string }[] = [];
  if (department) tags.push({ key: `dept:${department}`, label: department });
  for (const id of teams ?? []) {
    tags.push({
      key: id,
      label: tTeams(teamLabelKey(id)),
      dotClassName: teamColor(id),
    });
  }
  const visibleTags = tags.slice(0, maxTags);
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className={className}>
      {role && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="muted" className="shrink-0 cursor-help text-[10px]">
              {tRoles(role)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tRoles(`${role}_desc`)}
          </TooltipContent>
        </Tooltip>
      )}
      {visibleTags.map(tag => (
        <Badge
          key={tag.key}
          variant="outline"
          className="shrink-0 gap-1 text-[10px]"
        >
          {tag.dotClassName && (
            <span className={`size-1.5 rounded-full ${tag.dotClassName}`} />
          )}
          {tag.label}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] text-muted-foreground"
        >
          +{hiddenCount}
        </Badge>
      )}
    </div>
  );
}
