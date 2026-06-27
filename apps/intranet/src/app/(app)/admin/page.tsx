"use client";

import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, Mail, RotateCw, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, initials } from "@/lib/format";

function err(e: unknown) {
  toast.error(e instanceof Error ? e.message : "Error");
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
                onClick={() => deny({ requestId: r._id }).catch(err)}
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
                    .catch(err)
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

function Invites({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const invites = useQuery(api.invites.list, {});
  const create = useMutation(api.invites.create);
  const revoke = useMutation(api.invites.revoke);
  const resend = useMutation(api.invites.resend);

  async function onRevoke(id: Id<"invites">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ inviteId: id }).catch(err);
  }
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await create({ email: email.trim(), role });
      toast.success(t("sendInvite"));
      setEmail("");
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  const pending = invites?.filter(i => i.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <Card nested>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex-1">
            <Input
              type="email"
              placeholder={t("inviteEmail")}
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <RoleSelect value={role} onChange={setRole} canElevate={isAdmin} />
          <Button onClick={send} disabled={busy || !email.trim()}>
            <Mail className="mr-2 h-4 w-4" />
            {t("sendInvite")}
          </Button>
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
                  <Badge variant="muted">{i.role}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      resend({ inviteId: i._id })
                        .then(() => toast.success(t("resend")))
                        .catch(err)
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

function Members({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const members = useQuery(api.users.list, { includeSuspended: true });
  const setRole = useMutation(api.users.setRole);
  const setStatus = useMutation(api.users.setStatus);

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
    }).catch(err);
  }

  return (
    <div className="space-y-2">
      {members?.map(m => (
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
              </div>
              {m.status === "suspended" && (
                <Badge variant="destructive">{t("suspend")}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && m._id !== me._id ? (
                <>
                  <RoleSelect
                    value={m.role}
                    canElevate
                    onChange={role =>
                      setRole({ userId: m._id as Id<"users">, role })
                        .then(() => toast.success(tRoles(role)))
                        .catch(err)
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
              ) : (
                <Badge variant="muted">{tRoles(m.role)}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
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

  async function onRevoke(id: Id<"tempLogins">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ id }).catch(err);
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
      err(e);
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
