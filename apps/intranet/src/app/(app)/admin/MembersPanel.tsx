"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Copy, MoreHorizontal, Search, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PersonIdentityBadges } from "@/components/people/PersonIdentityBadges";
import { UserProfile } from "@/components/profile/UserProfile";
import { TOUR_CHECKPOINTS } from "@/components/tour/tour-config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { TEAMS } from "@/lib/teams";

function TourProgressChip({ userId }: { userId: Id<"users"> }) {
  const progress = useQuery(api.tourProgress.getMemberProgress, { userId });
  if (progress === undefined) return null;

  let completed = 0;
  const total = TOUR_CHECKPOINTS.length;
  if (progress) {
    try {
      const statuses = JSON.parse(progress.checkpointStatuses) as Record<
        string,
        string
      >;
      completed = Object.values(statuses).filter(s => s === "completed").length;
    } catch {
      // ignore parse errors
    }
  }

  if (completed === 0)
    return (
      <Badge variant="muted" className="text-[10px]">
        Setup ○
      </Badge>
    );
  if (completed < total)
    return (
      <Badge variant="warning" className="text-[10px]">
        Setup ◐
      </Badge>
    );
  return (
    <Badge variant="success" className="text-[10px]">
      Setup ✓
    </Badge>
  );
}

export function MembersPanel({ isManager }: { isManager: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const tCap = useTranslations("CustomRoles");
  const members = useQuery(api.users.list, { includeSuspended: true });
  const customRoles = useQuery(api.customRoles.list);
  const assignCustomRole = useMutation(api.users.assignCustomRole);
  const handleError = useErrorHandler();

  type Member = NonNullable<typeof members>[number];

  /** Short "what does this grant" summary for a custom role, for tooltips. */
  function capabilitiesSummary(
    role: NonNullable<typeof customRoles>[number]
  ): string {
    if (role.capabilities.length === 0) return tCap("noCapabilities");
    return role.capabilities.map(c => tCap(`capability_${c}`)).join(", ");
  }

  /** Same summary, looked up by the id stored on a member — for tooltips. */
  function memberCustomRoleSummary(m: {
    customRoleId?: Id<"customRoles"> | null;
  }): string {
    const assigned = m.customRoleId
      ? customRoles?.find(r => r._id === m.customRoleId)
      : null;
    return assigned ? capabilitiesSummary(assigned) : t("customRoleNone");
  }

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "suspended"
  >("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);

  const filtered = useMemo(() => {
    let list = members ?? [];
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      );
    if (roleFilter !== "all") list = list.filter(m => m.role === roleFilter);
    if (statusFilter !== "all")
      list = list.filter(m => m.status === statusFilter);
    if (teamFilter !== "all")
      list = list.filter(m => m.teams.includes(teamFilter));
    return list;
  }, [members, search, roleFilter, statusFilter, teamFilter]);

  function copyEmail(email: string) {
    void navigator.clipboard.writeText(email);
    toast.success(t("emailCopied"));
  }

  function onCustomRoleChange(m: Member, customRoleId: string) {
    assignCustomRole({
      userId: m._id as Id<"users">,
      customRoleId:
        customRoleId === "none"
          ? undefined
          : (customRoleId as Id<"customRoles">),
    }).catch(handleError);
  }

  // Quick actions only — everything that manages the account (roles,
  // permissions, suspend, remove) lives in the UserProfile drawer/dialog,
  // which already scales to more actions and adapts to mobile vs desktop
  // without this menu growing forever.
  function MemberMenu({ m }: { m: Member }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={t("moreActions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setSelectedId(m._id as Id<"users">)}>
            <Users2 className="size-4" /> {t("viewProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyEmail(m.email)}>
            <Copy className="size-4" /> {t("copyEmail")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function MemberRow(m: Member) {
    return (
      <Card
        nested
        key={m._id}
        className="transition-colors hover:border-border"
      >
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => setSelectedId(m._id as Id<"users">)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar className="h-9 w-9 shrink-0">
              {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
              <AvatarFallback className="text-xs">
                {initials(m.name, m.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{m.name}</p>
                {m.status === "suspended" && (
                  <Badge variant="destructive" className="text-[10px]">
                    {t("suspended")}
                  </Badge>
                )}
                {m.external && (
                  <Badge variant="warning" className="text-[10px]">
                    {t("external")}
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {m.email}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {m.gfAccess && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="muted"
                    className="hidden cursor-help text-[10px] sm:inline-flex"
                  >
                    GF
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {t("gfAccessTooltip")}
                </TooltipContent>
              </Tooltip>
            )}
            {m.applicantAccessDelegate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="muted"
                    className="hidden cursor-help text-[10px] sm:inline-flex"
                  >
                    BM
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {t("applicantDelegateBadgeTitle")}
                </TooltipContent>
              </Tooltip>
            )}
            <PersonIdentityBadges
              role={m.role}
              department={m.department}
              teams={m.teams}
              className="hidden flex-wrap items-center gap-1 sm:flex"
            />
            {customRoles && customRoles.length > 0 && (
              <Select
                value={m.customRoleId ?? "none"}
                onValueChange={v => onCustomRoleChange(m, v)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SelectTrigger
                      className="hidden h-7 w-auto min-w-28 text-xs sm:inline-flex"
                      aria-label={t("customRole")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {memberCustomRoleSummary(m)}
                  </TooltipContent>
                </Tooltip>
                <SelectContent>
                  <SelectItem value="none">{t("customRoleNone")}</SelectItem>
                  {customRoles.map(role => (
                    <SelectItem
                      key={role._id}
                      value={role._id}
                      title={capabilitiesSummary(role)}
                    >
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <TourProgressChip userId={m._id as Id<"users">} />
            <MemberMenu m={m} />
          </div>
        </div>
      </Card>
    );
  }

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("searchMembers")}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Select
            value={roleFilter}
            onValueChange={v => setRoleFilter(v as "all" | Role)}
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allRoles")}</SelectItem>
              <SelectItem value="employee">{tRoles("employee")}</SelectItem>
              <SelectItem value="manager">{tRoles("manager")}</SelectItem>
              <SelectItem value="admin">{tRoles("admin")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={v =>
              setStatusFilter(v as "all" | "active" | "suspended")
            }
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="active">{t("active")}</SelectItem>
              <SelectItem value="suspended">{t("suspended")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTeams")}</SelectItem>
              {TEAMS.map(team => (
                <SelectItem key={team.id} value={team.id}>
                  {tTeams(team.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {members === undefined ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tc("loading")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noMembers")}
        </p>
      ) : (
        <div className="space-y-2" data-tour="tour-admin-members">
          {filtered.map(MemberRow)}
        </div>
      )}

      {/* Shared, Discord-style member profile (drawer on mobile, dialog on
          desktop). It carries its own admin controls, so the heavy detail
          sheet that used to live here is gone. */}
      <UserProfile
        userId={selectedId}
        open={!!selectedId}
        onOpenChange={o => {
          if (!o) setSelectedId(null);
        }}
      />
    </div>
  );
}
