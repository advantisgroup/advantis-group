"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, Mail, RotateCw, Trash2, Users2 } from "lucide-react";
import { useState } from "react";

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
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, initials } from "@/lib/format";
import { TEAMS, teamLabelKey } from "@/lib/teams";

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
          <Users2 className="mr-1.5 h-3.5 w-3.5" />
          {t("teams")}
          {teams.length > 0 && (
            <span className="ml-1 tabular-nums">· {teams.length}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("teams")}</DropdownMenuLabel>
        {TEAMS.map(team => (
          <DropdownMenuCheckboxItem
            key={team.id}
            checked={teams.includes(team.id)}
            onCheckedChange={() => toggle(team.id)}
            onSelect={e => e.preventDefault()}
          >
            {tTeams(team.labelKey)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Members({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const tTeams = useTranslations("Teams");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const members = useQuery(api.users.list, { includeSuspended: true });
  const setRole = useMutation(api.users.setRole);
  const setStatus = useMutation(api.users.setStatus);
  const handleError = useErrorHandler();

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
    setStatus({
      userId,
      status: active ? "suspended" : "active",
    }).catch(handleError);
  }

  type Member = NonNullable<typeof members>[number];

  function renderMember(m: Member) {
    return (
      <Card nested key={m._id}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-9 w-9">
              {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
              <AvatarFallback className="text-xs">
                {initials(m.name, m.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{m.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.email}
              </p>
              {m.teams.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.teams.map(team => (
                    <Badge key={team} variant="muted" className="text-[10px]">
                      {tTeams(teamLabelKey(team))}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {m.status === "suspended" && (
              <Badge variant="destructive">{t("suspend")}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <TeamsEditor userId={m._id as Id<"users">} teams={m.teams} />
                {m._id !== me._id && (
                  <>
                    <RoleSelect
                      value={m.role}
                      canElevate
                      onChange={role =>
                        setRole({ userId: m._id as Id<"users">, role })
                          .then(() => toast.success(tRoles(role)))
                          .catch(handleError)
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void toggleStatus(
                          m._id as Id<"users">,
                          m.status === "active"
                        )
                      }
                    >
                      {m.status === "active" ? t("suspend") : t("activate")}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <Badge variant="muted">{tRoles(m.role)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const internal = members?.filter(m => !m.external) ?? [];
  const external = members?.filter(m => m.external) ?? [];

  return (
    <div className="space-y-2">
      {internal.map(renderMember)}

      {external.length > 0 && (
        <div className="space-y-2 pt-4">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t("externalMembers")}
            </h3>
            <Badge variant="warning">{external.length}</Badge>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {t("externalMembersHint")}
          </p>
          {external.map(renderMember)}
        </div>
      )}
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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} />
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
