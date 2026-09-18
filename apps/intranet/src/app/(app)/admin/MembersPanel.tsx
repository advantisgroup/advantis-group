"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, MoreHorizontal, Search, Users2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PersonIdentityBadges } from "@/components/people/PersonIdentityBadges";
import { UserProfile } from "@/components/profile/UserProfile";
import { TOUR_CHECKPOINTS } from "@/components/tour/tour-config";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { CAPABILITY_ICONS } from "@/lib/permission-icons";
import { TEAMS } from "@/lib/teams";
import { cn } from "@/lib/utils";

function TourProgressChip({ userId }: { userId: Id<"users"> }) {
  const progress = useQuery(api.people.tourProgress.getMemberProgress, { userId });
  if (progress === undefined) return null;

  let completed = 0;
  const total = TOUR_CHECKPOINTS.length;
  if (progress) {
    try {
      const statuses = JSON.parse(progress.checkpointStatuses) as Record<string, string>;
      completed = Object.values(statuses).filter((s) => s === "completed").length;
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
  const members = useQuery(api.people.users.list, { includeSuspended: true });
  const customRoles = useQuery(api.org.roles.list);
  const setCustomRoles = useMutation(api.people.users.setCustomRoles);
  const handleError = useErrorHandler();

  type Member = NonNullable<typeof members>[number];

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);

  const filtered = useMemo(() => {
    let list = members ?? [];
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter);
    if (statusFilter !== "all") list = list.filter((m) => m.status === statusFilter);
    if (teamFilter !== "all") list = list.filter((m) => m.teams.includes(teamFilter));
    return list;
  }, [members, search, roleFilter, statusFilter, teamFilter]);

  function copyEmail(email: string) {
    void navigator.clipboard.writeText(email);
    toast.success(t("emailCopied"));
  }

  /** Toggles a single custom role in/out of a member's set — someone can
   * hold more than one at once, so this is additive rather than replacing
   * the whole selection. */
  function toggleCustomRole(m: Member, customRoleId: Id<"customRoles">) {
    const current = m.customRoleIds ?? [];
    const next = current.includes(customRoleId)
      ? current.filter((id) => id !== customRoleId)
      : [...current, customRoleId];
    setCustomRoles({ userId: m._id as Id<"users">, customRoleIds: next }).catch(handleError);
  }

  // Quick actions only — everything that manages the account (roles,
  // permissions, suspend, remove) lives in the UserProfile drawer/dialog,
  // which already scales to more actions and adapts to mobile vs desktop
  // without this menu growing forever.
  function MemberMenu({ m }: { m: Member }) {
    return (
      <ActionMenu
        ariaLabel={t("moreActions")}
        align="end"
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={t("moreActions")}>
            <MoreHorizontal />
          </Button>
        }
        items={[
          {
            key: "view-profile",
            label: t("viewProfile"),
            icon: <Users2 className="size-4" />,
            onSelect: () => setSelectedId(m._id as Id<"users">),
          },
          {
            key: "copy-email",
            label: t("copyEmail"),
            icon: <Copy className="size-4" />,
            onSelect: () => copyEmail(m.email),
          },
        ]}
      />
    );
  }

  /**
   * One consolidated "what extra access does this person have" control,
   * replacing what used to be three separate elements in the row (a GF
   * badge, a BM badge, and a bare custom-role `<Select>`) with a single
   * trigger. The custom-role list is a checkbox grid — someone can hold more
   * than one — with an icon per capability so the grant reads at a glance,
   * matching CustomRolesPanel's own editor instead of a native dropdown.
   */
  function MemberAccessControl({ m }: { m: Member }) {
    const hasCustomRoles = (customRoles?.length ?? 0) > 0;
    if (!hasCustomRoles && !m.gfAccess && !m.applicantAccessDelegate) return null;

    const assignedRoles = (m.customRoleIds ?? [])
      .map((id) => customRoles?.find((r) => r._id === id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const extras = [m.gfAccess && "GF", m.applicantAccessDelegate && "BM"].filter(
      (v): v is string => !!v,
    );
    const roleLabel =
      assignedRoles.length > 0 ? assignedRoles.map((r) => r.name).join(", ") : t("customRoleNone");
    const label = extras.length > 0 ? `${roleLabel} · ${extras.join(" · ")}` : roleLabel;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("customRole")}
            className="h-7 max-w-40 truncate px-2 text-xs"
          >
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3" align="end">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("customRole")}
            </p>
            {hasCustomRoles ? (
              <div className="space-y-1">
                {customRoles?.map((role) => {
                  const checked = (m.customRoleIds ?? []).includes(role._id);
                  return (
                    <button
                      key={role._id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleCustomRole(m, role._id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-border/70 hover:border-border",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{role.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {role.capabilities.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {tCap("noCapabilities")}
                            </span>
                          ) : (
                            role.capabilities.map((cap) => {
                              const Icon = CAPABILITY_ICONS[cap];
                              return (
                                <span
                                  key={cap}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                                >
                                  <Icon className="size-3" />
                                  {tCap(`capability_${cap}`)}
                                </span>
                              );
                            })
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{tCap("empty")}</p>
            )}
          </div>
          {(m.gfAccess || m.applicantAccessDelegate) && (
            <div className="space-y-1.5 border-t border-border/70 pt-2.5">
              {m.gfAccess && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-fg">{t("gfBadge")}</span> —{" "}
                  {t("gfAccessTooltip")}
                </p>
              )}
              {m.applicantAccessDelegate && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-fg">{t("applicantDelegateBadge")}</span> —{" "}
                  {t("applicantDelegateBadgeTitle")}
                </p>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  /** Name + status/external badges + email — the one bit both layouts share. */
  function MemberIdentity({ m }: { m: Member }) {
    return (
      <button
        type="button"
        onClick={() => setSelectedId(m._id as Id<"users">)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar className="h-9 w-9 shrink-0">
          {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
          <AvatarFallback className="text-xs">{initials(m.name, m.email)}</AvatarFallback>
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
          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
        </div>
      </button>
    );
  }

  /** Mobile: a card per member, grouped into labeled sections (identity /
   * role & org / access) instead of one dense row of same-looking badges. */
  function MemberCard(m: Member) {
    return (
      <Card key={m._id} className="transition-colors hover:border-border">
        <CardContent className="space-y-3 p-3">
          <div className="flex items-center gap-3">
            <MemberIdentity m={m} />
            <MemberMenu m={m} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2.5">
            <PersonIdentityBadges
              role={m.role}
              department={m.department}
              teams={m.teams}
              className="flex flex-wrap items-center gap-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MemberAccessControl m={m} />
            <TourProgressChip userId={m._id as Id<"users">} />
          </div>
        </CardContent>
      </Card>
    );
  }

  /** Desktop: a proper table — role, department/teams, access and setup
   * each get their own column instead of competing for space in one row. */
  function MemberTableRow(m: Member) {
    return (
      <TableRow key={m._id}>
        <TableCell>
          <MemberIdentity m={m} />
        </TableCell>
        <TableCell>
          <PersonIdentityBadges role={m.role} className="flex flex-wrap items-center gap-1" />
        </TableCell>
        <TableCell>
          <PersonIdentityBadges
            department={m.department}
            teams={m.teams}
            maxTags={3}
            className="flex flex-wrap items-center gap-1"
          />
        </TableCell>
        <TableCell>
          <MemberAccessControl m={m} />
        </TableCell>
        <TableCell>
          <TourProgressChip userId={m._id as Id<"users">} />
        </TableCell>
        <TableCell className="text-right">
          <MemberMenu m={m} />
        </TableCell>
      </TableRow>
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchMembers")}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | Role)}>
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
            onValueChange={(v) => setStatusFilter(v as "all" | "active" | "suspended")}
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
              {TEAMS.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {tTeams(team.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {members === undefined ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{tc("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noMembers")}</p>
      ) : (
        <div data-tour="tour-admin-members">
          {/* Below sm: a card per member. sm and up: a proper table, so
              role/department/access/setup each get their own column instead
              of competing for space in one row. */}
          <div className="space-y-2 sm:hidden">{filtered.map(MemberCard)}</div>
          <Card className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("member")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("departmentAndTeams")}</TableHead>
                  <TableHead>{t("access")}</TableHead>
                  <TableHead>{t("setup")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{filtered.map(MemberTableRow)}</TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Shared, Discord-style member profile (drawer on mobile, dialog on
          desktop). It carries its own admin controls, so the heavy detail
          sheet that used to live here is gone. */}
      <UserProfile
        userId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
      />
    </div>
  );
}
