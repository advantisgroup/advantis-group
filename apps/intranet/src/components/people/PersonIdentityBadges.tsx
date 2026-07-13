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
 */
export function PersonIdentityBadges({
  role,
  department,
  teams,
  className,
}: {
  role?: PersonRole;
  department?: string | null;
  teams?: readonly string[];
  className?: string;
}) {
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");

  return (
    <div className={className}>
      {role && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="muted" className="cursor-help text-[10px]">
              {tRoles(role)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tRoles(`${role}_desc`)}
          </TooltipContent>
        </Tooltip>
      )}
      {department && (
        <Badge variant="outline" className="text-[10px]">
          {department}
        </Badge>
      )}
      {teams?.map(id => (
        <Badge key={id} variant="outline" className="gap-1 text-[10px]">
          <span className={`size-1.5 rounded-full ${teamColor(id)}`} />
          {tTeams(teamLabelKey(id))}
        </Badge>
      ))}
    </div>
  );
}
