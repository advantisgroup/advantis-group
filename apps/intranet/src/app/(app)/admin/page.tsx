"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Clock,
  Copy,
  KeyRound,
  Mail,
  MoreHorizontal,
  RotateCw,
  Search,
  ShieldCheck,
  Users,
  Users2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { CustomRolesPanel } from "@/app/(app)/admin/CustomRolesPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { OneDriveAuditPanel } from "@/components/onedrive/OneDriveAuditPanel";
import { TeamAccessPanel } from "@/components/onedrive/TeamAccessPanel";
import { UploadApprovalQueue } from "@/components/onedrive/UploadApprovalQueue";
import { PageHeader } from "@/components/PageHeader";
import { UserProfile } from "@/components/profile/UserProfile";
import {
  useCurrentUser,
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
import { TOUR_CHECKPOINTS } from "@/components/tour/tour-config";
import { useTour } from "@/components/tour/TourProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, initials } from "@/lib/format";
import { TEAMS } from "@/lib/teams";
import { cn } from "@/lib/utils";

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

function RoleSelect({
  value,
  onChange,
  canElevate,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  canElevate: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("Roles");
  return (
    <Select
      value={value}
      onValueChange={v => onChange(v as Role)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="employee">{t("employee")}</SelectItem>
        {canElevate && <SelectItem value="manager">{t("manager")}</SelectItem>}
        {canElevate && <SelectItem value="admin">{t("admin")}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function AccessRequests({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const requests = useQuery(api.accessRequests.list, { status: "pending" });
  const approve = useMutation(api.accessRequests.approve);
  const deny = useMutation(api.accessRequests.deny);
  const handleError = useErrorHandler();
  const [roles, setRoles] = useState<Record<string, Role>>({});

  if (requests && requests.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noRequests")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {requests?.map(r => (
        <Card nested key={r._id}>
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{r.name ?? r.email}</p>
              <p className="text-xs text-muted-foreground">{r.email}</p>
              {r.message && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RoleSelect
                value={roles[r._id] ?? "employee"}
                onChange={role => setRoles(s => ({ ...s, [r._id]: role }))}
                canElevate={isAdmin}
              />
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => deny({ requestId: r._id }).catch(handleError)}
              >
                {t("deny")}
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() =>
                  approve({
                    requestId: r._id,
                    role: roles[r._id] ?? "employee",
                  })
                    .then(() => toast.success(t("approve")))
                    .catch(handleError)
                }
              >
                {t("approve")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** True when `email`'s domain is outside the configured company domains. */
function isExternalEmail(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return false;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain.length > 0 && !allowedDomains.includes(domain);
}

function Invites({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const invites = useQuery(api.invites.list, {});
  const config = useQuery(api.invites.config, {});
  // create/resend/revoke are Convex actions: they call Clerk's Backend API
  // directly and await it, so failures surface here as a rejected promise.
  const create = useAction(api.invites.create);
  const revoke = useAction(api.invites.revoke);
  const resend = useAction(api.invites.resend);
  const handleError = useErrorHandler();
  const allowedDomains = config?.allowedDomains ?? [];

  async function onRevoke(id: Id<"invites">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ inviteId: id }).catch(handleError);
  }
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) return;

    // Emails outside the company domains are admin-only and need an explicit
    // confirmation before Clerk sends the invitation.
    if (isExternalEmail(trimmed, allowedDomains)) {
      if (!isAdmin) {
        toast.error(t("inviteExternalForbidden"));
        return;
      }
      const ok = await confirm({
        title: t("inviteExternalTitle"),
        description: t("inviteExternalBody", { email: trimmed }),
        confirmLabel: t("sendInvite"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await create({ email: trimmed, role });
      toast.success(t("sendInvite"));
      setEmail("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const enteredExternal = isExternalEmail(email.trim(), allowedDomains);

  const pending = invites?.filter(i => i.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <Card nested>
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <Input
              type="email"
              placeholder={t("inviteEmail")}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <RoleSelect
                value={role}
                onChange={setRole}
                canElevate={isAdmin}
              />
              <Button
                onClick={send}
                disabled={
                  busy || !email.trim() || (enteredExternal && !isAdmin)
                }
                className="flex-1 sm:flex-none"
              >
                <Mail className="mr-2 h-4 w-4" />
                {t("sendInvite")}
              </Button>
            </div>
          </div>
          {enteredExternal && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {isAdmin ? t("inviteExternalHint") : t("inviteExternalForbidden")}
            </p>
          )}
        </CardContent>
      </Card>

      {pending.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noInvites")}
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map(i => (
            <Card nested key={i._id}>
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("invitedBy", { name: i.invitedByName })} ·{" "}
                      {formatDateTime(i.createdAt, locale)}
                    </p>
                  </div>
                  {i.external && (
                    <Badge variant="warning" className="shrink-0">
                      {t("external")}
                    </Badge>
                  )}
                  <Badge variant="muted" className="shrink-0">
                    {i.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    onClick={() =>
                      resend({ inviteId: i._id })
                        .then(() => toast.success(t("resend")))
                        .catch(handleError)
                    }
                  >
                    <RotateCw className="mr-1 h-3.5 w-3.5" />
                    {t("resend")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    onClick={() => void onRevoke(i._id)}
                  >
                    {t("revoke")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A compact stat strip for the admin landing. The old full KPI cards ate a
 * whole screen of vertical space on mobile and pushed the actual member list
 * below the fold, so this trades them for small inline pills that wrap.
 */
function AdminOverview({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const members = useQuery(api.users.list, { includeSuspended: true });
  const requests = useQuery(api.accessRequests.list, { status: "pending" });
  const invites = useQuery(api.invites.list, { status: "pending" });
  const guests = useQuery(api.guest.listTempLogins, isAdmin ? {} : "skip");

  const dash = (n: number | undefined) => (n === undefined ? "—" : n);
  const activeMembers = members?.filter(m => m.status === "active").length;
  const reqCount = requests?.length;
  const invCount = invites?.length;
  const guestCount = guests?.filter(g => g.status === "active").length;

  const stats: {
    label: string;
    value: number | string;
    icon: typeof Users;
    accent: boolean;
  }[] = [
    {
      label: t("overviewMembers"),
      value: dash(activeMembers),
      icon: Users,
      accent: false,
    },
    {
      label: t("overviewRequests"),
      value: dash(reqCount),
      icon: Clock,
      accent: !!reqCount,
    },
    {
      label: t("overviewInvites"),
      value: dash(invCount),
      icon: Mail,
      accent: !!invCount,
    },
  ];
  if (isAdmin)
    stats.push({
      label: t("overviewGuests"),
      value: dash(guestCount),
      icon: KeyRound,
      accent: !!guestCount,
    });

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2 sm:flex-1 sm:basis-40"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md ring-1 ring-inset",
                s.accent
                  ? "bg-signal/12 text-signal ring-signal/25"
                  : "bg-panel-2 text-muted-foreground ring-border"
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="text-lg font-semibold leading-none tabular-nums">
              {s.value}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Members() {
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
              <Badge
                variant="muted"
                className="hidden text-[10px] sm:inline-flex"
              >
                GF
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="muted"
                  className="hidden cursor-help sm:inline-flex"
                >
                  {tRoles(m.role)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {tRoles(`${m.role}_desc`)}
              </TooltipContent>
            </Tooltip>
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

function GuestLogins() {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const logins = useQuery(api.guest.listTempLogins, {});
  const create = useMutation(api.guest.createTempLogin);
  const revoke = useMutation(api.guest.revokeTempLogin);
  const handleError = useErrorHandler();

  async function onRevoke(id: Id<"tempLogins">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ id }).catch(handleError);
  }
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("48");
  const [busy, setBusy] = useState(false);

  async function make() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await create({
        label: label.trim(),
        email: email.trim() || undefined,
        hours: Number(hours) || 48,
      });
      toast.success(t("createGuest"));
      setLabel("");
      setEmail("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    void navigator.clipboard.writeText(`${origin}/guest/login?token=${token}`);
    toast.success(t("copied"));
  }

  const statusVariant = (s: string) =>
    s === "active" ? "success" : s === "expired" ? "warning" : "muted";

  return (
    <div className="space-y-4">
      <Card nested>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Input
            placeholder={t("guestLabel")}
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="sm:flex-1"
          />
          <Input
            type="email"
            placeholder={t("guestEmail")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="sm:w-48"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={hours}
              onChange={e => setHours(e.target.value)}
              className="w-20 shrink-0"
              aria-label={t("guestHours")}
            />
            <Button
              onClick={make}
              disabled={busy || !label.trim()}
              className="flex-1 sm:flex-none"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {t("createGuest")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {logins && logins.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noGuests")}
        </p>
      ) : (
        <div className="space-y-2">
          {logins?.map(g => (
            <Card nested key={g._id}>
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.email ?? "—"} · {t("expires")}{" "}
                      {formatDateTime(g.expiresAt, locale)}
                    </p>
                  </div>
                  <Badge variant={statusVariant(g.status)} className="shrink-0">
                    {g.status === "active"
                      ? t("active")
                      : g.status === "expired"
                        ? t("expired")
                        : t("revoked")}
                  </Badge>
                </div>
                {g.status === "active" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => copyLink(g.token)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {t("copyLink")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => void onRevoke(g._id)}
                    >
                      {t("revoke")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const hasUploadsView = useHasCapability("manage_uploads");
  const me = useCurrentUser();
  const isAdmin = me.role === "admin";
  const { currentStep } = useTour();
  const [tab, setTab] = useState("requests");

  // Deep-link support: upload-approval notifications link to /admin?tab=uploads.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (param) setTab(param);
  }, []);

  // The Members section is a tab, not its own route, so the onboarding tour
  // can't reach it by navigating. When the tour spotlights member management,
  // switch to that tab so the highlighted target is actually on screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentStep?.id === "admin.members") setTab("members");
  }, [currentStep?.id]);

  if (!isManager) {
    // An employee with the `manage_uploads` custom-role capability gets a
    // read-only slice of this page (queue + audit log) instead of the full
    // member-management admin panel. Approving/denying still requires a real
    // manager — that write goes through OneDrive's locked-in access rules.
    if (hasUploadsView) {
      return (
        <div className="mx-auto max-w-6xl space-y-8">
          <PageHeader
            title={t("uploads")}
            description={t("pendingUploads")}
            icon={<ShieldCheck />}
          />
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("pendingUploads")}
            </h3>
            <UploadApprovalQueue readOnly />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("oneDriveActivity")}
            </h3>
            <OneDriveAuditPanel />
          </div>
        </div>
      );
    }
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<ShieldCheck />}
      />
      <AdminOverview isAdmin={isAdmin} />
      <Tabs value={tab} onValueChange={setTab}>
        {/* On mobile the tabs become a full-width segmented control so each
            target sits in the thumb zone; on desktop they revert to the
            compact inline pill bar. */}
        <TabsList
          className={cn(
            "grid h-auto w-full gap-1 p-1 sm:inline-flex sm:h-10 sm:w-auto sm:gap-0",
            isAdmin ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          <TabsTrigger value="requests" className="py-2 sm:py-1.5">
            {t("accessRequests")}
          </TabsTrigger>
          <TabsTrigger value="invites" className="py-2 sm:py-1.5">
            {t("invites")}
          </TabsTrigger>
          <TabsTrigger value="members" className="py-2 sm:py-1.5">
            {t("members")}
          </TabsTrigger>
          <TabsTrigger
            value="uploads"
            className="py-2 sm:py-1.5"
            data-tour="tour-admin-uploads"
          >
            {t("uploads")}
          </TabsTrigger>
          <TabsTrigger value="roles" className="py-2 sm:py-1.5">
            {t("customRolesTab")}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="guests" className="py-2 sm:py-1.5">
              {t("guests")}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="requests">
          <AccessRequests isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="invites">
          <Invites isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="members">
          <Members />
        </TabsContent>
        <TabsContent value="roles">
          <CustomRolesPanel />
        </TabsContent>
        <TabsContent value="uploads" className="space-y-8">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("pendingUploads")}
            </h3>
            <UploadApprovalQueue />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("teamAccessTitle")}
            </h3>
            <TeamAccessPanel />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("oneDriveActivity")}
            </h3>
            <OneDriveAuditPanel />
          </div>
        </TabsContent>
        {isAdmin && (
          <TabsContent value="guests">
            <GuestLogins />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
