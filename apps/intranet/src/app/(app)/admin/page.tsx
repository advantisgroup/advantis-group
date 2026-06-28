"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  Clock,
  Copy,
  KeyRound,
  Mail,
  MoreHorizontal,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  UserMinus,
  Users,
  Users2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatCard } from "@/components/activity/StatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, initials } from "@/lib/format";
import { TEAMS, teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";

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
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium">{r.name ?? r.email}</p>
              <p className="text-xs text-muted-foreground">{r.email}</p>
              {r.message && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <RoleSelect
                value={roles[r._id] ?? "employee"}
                onChange={role => setRoles(s => ({ ...s, [r._id]: role }))}
                canElevate={isAdmin}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => deny({ requestId: r._id }).catch(handleError)}
              >
                {t("deny")}
              </Button>
              <Button
                size="sm"
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder={t("inviteEmail")}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <RoleSelect value={role} onChange={setRole} canElevate={isAdmin} />
            <Button
              onClick={send}
              disabled={busy || !email.trim() || (enteredExternal && !isAdmin)}
            >
              <Mail className="mr-2 h-4 w-4" />
              {t("sendInvite")}
            </Button>
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
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("invitedBy", { name: i.invitedByName })} ·{" "}
                    {formatDateTime(i.createdAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {i.external && (
                    <Badge variant="warning">{t("external")}</Badge>
                  )}
                  <Badge variant="muted">{i.role}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
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

function TeamsEditor({
  userId,
  teams,
}: {
  userId: Id<"users">;
  teams: string[];
}) {
  const t = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const setTeams = useMutation(api.users.setTeams);
  const handleError = useErrorHandler();

  function toggle(id: string) {
    const next = teams.includes(id)
      ? teams.filter(x => x !== id)
      : [...teams, id];
    setTeams({ userId, teams: next }).catch(handleError);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Users2 className="size-3.5" />
          {t("teams")}
          {teams.length > 0 && (
            <span className="ml-0.5 flex items-center gap-1">
              {teams.map(id => (
                <span
                  key={id}
                  className={cn("size-1.5 rounded-full", teamColor(id))}
                />
              ))}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("teams")}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {teams.length}/{TEAMS.length}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TEAMS.map(team => {
          const checked = teams.includes(team.id);
          return (
            <DropdownMenuCheckboxItem
              key={team.id}
              checked={checked}
              onCheckedChange={() => toggle(team.id)}
              onSelect={e => e.preventDefault()}
              className="gap-2 py-1.5"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-opacity",
                  teamColor(team.id),
                  checked ? "opacity-100" : "opacity-40"
                )}
              />
              <span className="flex-1">{tTeams(team.labelKey)}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** KPI tiles so the admin landing reads at a glance instead of feeling empty. */
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

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t("overviewMembers")}
        value={dash(activeMembers)}
        tone="fg"
        icon={<Users className="h-4 w-4" />}
      />
      <StatCard
        label={t("overviewRequests")}
        value={dash(reqCount)}
        tone={reqCount ? "warn" : "muted"}
        icon={<Clock className="h-4 w-4" />}
      />
      <StatCard
        label={t("overviewInvites")}
        value={dash(invCount)}
        tone={invCount ? "accent" : "muted"}
        icon={<Mail className="h-4 w-4" />}
      />
      {isAdmin && (
        <StatCard
          label={t("overviewGuests")}
          value={dash(guestCount)}
          tone={guestCount ? "ok" : "muted"}
          icon={<KeyRound className="h-4 w-4" />}
        />
      )}
    </div>
  );
}

function Members({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const locale = useLocale();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const members = useQuery(api.users.list, { includeSuspended: true });
  const setRole = useMutation(api.users.setRole);
  const setStatus = useAction(api.users.setStatus);
  const removeMember = useAction(api.members.remove);
  const reinvite = useAction(api.members.reinvite);
  const handleError = useErrorHandler();

  type Member = NonNullable<typeof members>[number];

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
    if (teamFilter !== "all") list = list.filter(m => m.teams.includes(teamFilter));
    return list;
  }, [members, search, roleFilter, statusFilter, teamFilter]);

  const selected = members?.find(m => m._id === selectedId) ?? null;

  async function toggleStatus(userId: Id<"users">, active: boolean) {
    if (active) {
      const ok = await confirm({
        title: t("suspend"),
        description: tc("deleteWarning"),
        confirmLabel: t("suspend"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    setStatus({ userId, status: active ? "suspended" : "active" }).catch(
      handleError
    );
  }

  async function onRemove(m: Member) {
    const ok = await confirm({
      title: t("removeTitle", { name: m.name }),
      description: t("removeBody"),
      confirmLabel: t("removeMember"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    setSelectedId(null);
    removeMember({ userId: m._id as Id<"users"> })
      .then(() => toast.success(t("removed")))
      .catch(handleError);
  }

  function onReinvite(m: Member) {
    reinvite({ userId: m._id as Id<"users"> })
      .then(() => toast.success(t("reinviteSent")))
      .catch(handleError);
  }

  function copyEmail(email: string) {
    void navigator.clipboard.writeText(email);
    toast.success(t("emailCopied"));
  }

  function changeRole(m: Member, role: Role) {
    setRole({ userId: m._id as Id<"users">, role })
      .then(() => toast.success(tRoles(role)))
      .catch(handleError);
  }

  function MemberMenu({ m }: { m: Member }) {
    const isSelf = m._id === me._id;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={t("moreActions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => setSelectedId(m._id as Id<"users">)}
          >
            <Users2 className="size-4" /> {t("viewProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyEmail(m.email)}>
            <Copy className="size-4" /> {t("copyEmail")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onReinvite(m)}>
            <Send className="size-4" /> {t("reinvite")}
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem
              onClick={() =>
                void toggleStatus(m._id as Id<"users">, m.status === "active")
              }
            >
              <ShieldCheck className="size-4" />{" "}
              {m.status === "active" ? t("suspend") : t("activate")}
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void onRemove(m)}
              >
                <UserMinus className="size-4" /> {t("removeMember")}
              </DropdownMenuItem>
            </>
          )}
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
            <Badge variant="muted" className="hidden sm:inline-flex">
              {tRoles(m.role)}
            </Badge>
            {isAdmin && <MemberMenu m={m} />}
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
        <div className="flex gap-2">
          <Select
            value={roleFilter}
            onValueChange={v => setRoleFilter(v as "all" | Role)}
          >
            <SelectTrigger className="w-32">
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
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="active">{t("active")}</SelectItem>
              <SelectItem value="suspended">{t("suspended")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-32">
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
        <div className="space-y-2">{filtered.map(MemberRow)}</div>
      )}

      {/* Profile detail drawer */}
      <Sheet
        open={!!selected}
        onOpenChange={o => {
          if (!o) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-6 sm:max-w-md"
        >
          {selected && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14 shrink-0">
                  {selected.avatar && (
                    <AvatarImage src={selected.avatar} alt={selected.name} />
                  )}
                  <AvatarFallback>
                    {initials(selected.name, selected.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{selected.name}</SheetTitle>
                  <SheetDescription className="truncate">
                    {selected.email}
                  </SheetDescription>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge variant="muted">{tRoles(selected.role)}</Badge>
                    <Badge
                      variant={
                        selected.status === "active" ? "success" : "destructive"
                      }
                    >
                      {selected.status === "active"
                        ? t("active")
                        : t("suspended")}
                    </Badge>
                    {selected.external && (
                      <Badge variant="warning">{t("external")}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-3 rounded-lg border border-border/70 p-3">
                  {/* Role can't be changed on your own account, but you can
                      still manage your own team membership. */}
                  {selected._id !== me._id && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        {t("role")}
                      </span>
                      <RoleSelect
                        value={selected.role}
                        canElevate
                        onChange={role => changeRole(selected, role)}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t("teams")}
                    </span>
                    <TeamsEditor
                      userId={selected._id as Id<"users">}
                      teams={selected.teams}
                    />
                  </div>
                </div>
              )}

              <dl className="space-y-2 rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("joined")}</dt>
                  <dd className="tabular-nums">
                    {formatDateTime(selected.createdAt, locale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("lastActive")}</dt>
                  <dd className="tabular-nums">
                    {selected.lastSeenAt
                      ? formatDateTime(selected.lastSeenAt, locale)
                      : t("never")}
                  </dd>
                </div>
              </dl>

              {selected.teams.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.teams.map(team => (
                    <Badge key={team} variant="muted" className="gap-1.5">
                      <span
                        className={cn("size-1.5 rounded-full", teamColor(team))}
                      />
                      {tTeams(teamLabelKey(team))}
                    </Badge>
                  ))}
                </div>
              )}

              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReinvite(selected)}
                  >
                    <Send /> {t("reinvite")}
                  </Button>
                  {selected._id !== me._id && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void toggleStatus(
                            selected._id as Id<"users">,
                            selected.status === "active"
                          )
                        }
                      >
                        {selected.status === "active"
                          ? t("suspend")
                          : t("activate")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void onRemove(selected)}
                      >
                        <UserMinus /> {t("removeMember")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
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
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex-1">
            <Input
              placeholder={t("guestLabel")}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <Input
            type="email"
            placeholder={t("guestEmail")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-48"
          />
          <Input
            type="number"
            min={1}
            value={hours}
            onChange={e => setHours(e.target.value)}
            className="w-20"
            aria-label={t("guestHours")}
          />
          <Button onClick={make} disabled={busy || !label.trim()}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("createGuest")}
          </Button>
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
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.email ?? "—"} · {t("expires")}{" "}
                    {formatDateTime(g.expiresAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(g.status)}>
                    {g.status === "active"
                      ? t("active")
                      : g.status === "expired"
                        ? t("expired")
                        : t("revoked")}
                  </Badge>
                  {g.status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyLink(g.token)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        {t("copyLink")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onRevoke(g._id)}
                      >
                        {t("revoke")}
                      </Button>
                    </>
                  )}
                </div>
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
  const me = useCurrentUser();
  const isAdmin = me.role === "admin";

  if (!isManager) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<ShieldCheck />}
      />
      <AdminOverview isAdmin={isAdmin} />
      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">{t("accessRequests")}</TabsTrigger>
          <TabsTrigger value="invites">{t("invites")}</TabsTrigger>
          <TabsTrigger value="members">{t("members")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="guests">{t("guests")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="requests">
          <AccessRequests isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="invites">
          <Invites isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="members">
          <Members isAdmin={isAdmin} />
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
