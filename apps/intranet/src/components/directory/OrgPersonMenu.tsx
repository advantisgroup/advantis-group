"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Building2, Crown, MoreHorizontal, Star, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type Person } from "./person-status";

export interface OrgUnits {
  teams: {
    _id: Id<"teams">;
    name: string;
    slug: string;
    reportsToUserId?: Id<"users">;
    departmentId?: Id<"departments">;
  }[];
  departments: { _id: Id<"departments">; name: string; reportsToUserId?: Id<"users"> }[];
  /** Admins shape the structure; people who manage members can place someone in a department. */
  canAdmin: boolean;
  canSetDepartment: boolean;
}

const NO_DEPARTMENT = "none";

/** Everything about one person's place in the org, from their row in the chart. */
export function OrgPersonMenu({ person, units }: { person: Person; units: OrgUnits }) {
  const t = useTranslations("Directory");
  const handleError = useErrorHandler();
  const setTeamLead = useMutation(api.orgData.setTeamReportsTo);
  const setDepartmentLead = useMutation(api.orgData.setDepartmentReportsTo);
  const setDepartment = useMutation(api.orgData.setUserDepartment);
  const addToTeam = useMutation(api.orgData.addUserToTeam);
  const removeFromTeam = useMutation(api.orgData.removeUserFromTeam);
  const setManagingDirector = useMutation(api.users.setManagingDirector);

  const saved = (promise: Promise<unknown>) =>
    promise.then(() => toast.success(t("orgSaved"))).catch(handleError);

  const currentDepartment =
    units.departments.find(
      (d) => d.name.trim().toLowerCase() === (person.department ?? "").trim().toLowerCase(),
    )?._id ?? NO_DEPARTMENT;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("orgManage", { name: person.name })}
          className="shrink-0 text-muted-foreground"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">{person.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {units.canSetDepartment && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Building2 />
              {t("orgMenuDepartment")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuRadioGroup
                value={currentDepartment}
                onValueChange={(value) =>
                  saved(
                    setDepartment({
                      userId: person._id,
                      departmentId: value === NO_DEPARTMENT ? null : (value as Id<"departments">),
                    }),
                  )
                }
              >
                <DropdownMenuRadioItem value={NO_DEPARTMENT}>
                  {t("orgMenuNoDepartment")}
                </DropdownMenuRadioItem>
                {units.departments.map((department) => (
                  <DropdownMenuRadioItem key={department._id} value={department._id}>
                    {department.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {units.canAdmin && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Users2 />
                {t("orgMenuTeams")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {units.teams.length === 0 && (
                  <DropdownMenuItem disabled>{t("orgMenuNoTeams")}</DropdownMenuItem>
                )}
                {units.teams.map((team) => {
                  const member = person.teams.includes(team.slug);
                  return (
                    <DropdownMenuCheckboxItem
                      key={team._id}
                      checked={member}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() =>
                        saved(
                          member
                            ? removeFromTeam({ userId: person._id, teamId: team._id })
                            : addToTeam({ userId: person._id, teamId: team._id }),
                        )
                      }
                    >
                      {team.name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Star />
                {t("orgMenuLeads")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {units.departments.length > 0 && (
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {t("orgMenuLeadDepartments")}
                  </DropdownMenuLabel>
                )}
                {units.departments.map((department) => {
                  const leads = department.reportsToUserId === person._id;
                  return (
                    <DropdownMenuCheckboxItem
                      key={department._id}
                      checked={leads}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() =>
                        saved(
                          setDepartmentLead({
                            departmentId: department._id,
                            userId: leads ? null : person._id,
                          }),
                        )
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{department.name}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {units.teams.length > 0 && (
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {t("orgMenuLeadTeams")}
                  </DropdownMenuLabel>
                )}
                {units.teams.map((team) => {
                  const leads = team.reportsToUserId === person._id;
                  return (
                    <DropdownMenuCheckboxItem
                      key={team._id}
                      checked={leads}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() =>
                        saved(setTeamLead({ teamId: team._id, userId: leads ? null : person._id }))
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
                <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
                  {t("orgMenuLeadHint")}
                </p>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                saved(
                  setManagingDirector({
                    userId: person._id,
                    managingDirector: !person.managingDirector,
                  }),
                )
              }
            >
              <Crown />
              {person.managingDirector ? t("orgMenuDirectorRemove") : t("orgMenuDirectorMake")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
