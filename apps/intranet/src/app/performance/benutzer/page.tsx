"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  CreateLoginDialog,
  EditLoginDialog,
  type LoginRow,
  ResetPasswordDialog,
} from "@/components/performance/LoginDialogs";
import { MetricTile } from "@/components/performance/MetricTile";
import { PerformanceShell, usePerformanceGate } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PerformanceUsersPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { token, loading, session } = usePerformanceGate((s) =>
    s.permissions.includes("manage_logins"),
  );
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LoginRow | null>(null);
  const [resetting, setResetting] = useState<Id<"performanceLogins"> | null>(null);

  const args = session ? { token } : "skip";
  const logins = useQuery(api.performance.auth.listLogins, args);
  const employees = useQuery(api.performance.auth.listEmployeesForLink, args);
  const intranetUsers = useQuery(api.performance.auth.listIntranetUsersForLink, args);
  const roles = useQuery(api.performance.roles.list, args);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!logins || !q) return logins ?? [];
    return logins.filter(
      (l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q),
    );
  }, [logins, search]);

  if (loading) return <PerformancePageSkeleton />;
  if (!session) return null;

  type Login = NonNullable<typeof logins>[number];
  const isSelf = (l: Login) => l.id === session.loginId;

  const rowMenu = (login: Login) => (
    <ActionMenu
      ariaLabel={t("rowActions")}
      trigger={
        <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
          <MoreHorizontal />
        </Button>
      }
      items={[
        {
          key: "edit",
          label: t("userEditTitle"),
          icon: <Pencil />,
          onSelect: () => setEditing(login),
        },
        {
          key: "password",
          label: isSelf(login) ? t("passwordLink") : t("userResetPasswordTitle"),
          icon: <KeyRound />,
          onSelect: () =>
            isSelf(login) ? router.push("/performance/passwort") : setResetting(login.id),
        },
      ]}
    />
  );

  const identity = (login: Login) => (
    <button type="button" onClick={() => setEditing(login)} className="min-w-0 flex-1 text-left">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{login.name}</span>
        {isSelf(login) && (
          <Badge variant="muted" className="text-[10px]">
            {t("userYouBadge")}
          </Badge>
        )}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{login.email}</span>
    </button>
  );

  const roleBadge = (login: Login) => (
    <Badge variant={login.isSuperAdmin ? "default" : "muted"}>
      {login.isSuperAdmin ? t("userRoleSuperAdmin") : (login.roleName ?? "–")}
    </Badge>
  );
  const statusBadge = (login: Login) => (
    <Badge variant={login.active ? "success" : "muted"}>
      {login.active ? t("userActiveLabel") : t("userInactiveLabel")}
    </Badge>
  );

  return (
    <PerformanceShell
      title={t("usersTitle")}
      description={t("usersIntro")}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("userNew")}
        </Button>
      }
    >
      {logins && logins.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <MetricTile icon={UsersIcon} label={t("usersStatTotal")} value={String(logins.length)} />
          <MetricTile
            icon={UserCheck}
            label={t("usersStatActive")}
            value={String(logins.filter((l) => l.active).length)}
          />
          <MetricTile
            icon={ShieldCheck}
            label={t("usersStatAdmins")}
            value={String(logins.filter((l) => l.isSuperAdmin || l.roleName === "Admin").length)}
          />
        </div>
      )}

      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("usersSearch")}
            className="pl-8"
          />
        </div>

        {logins === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {logins.length === 0 ? t("usersEmpty") : t("usersNoMatch")}
          </p>
        ) : (
          <>
            <div className="space-y-2 sm:hidden">
              {filtered.map((login) => (
                <Card key={login.id}>
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-center gap-3">
                      {identity(login)}
                      {rowMenu(login)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2.5">
                      {roleBadge(login)}
                      {statusBadge(login)}
                      {login.employeeName && (
                        <span className="text-xs text-muted-foreground">{login.employeeName}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nameLabel")}</TableHead>
                    <TableHead>{t("userRoleLabel")}</TableHead>
                    <TableHead>{t("userEmployeeLabel")}</TableHead>
                    <TableHead>{t("userIntranetAccountLabel")}</TableHead>
                    <TableHead>{t("userStatusLabel")}</TableHead>
                    <TableHead className="text-right">{t("rowActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((login) => (
                    <TableRow key={login.id}>
                      <TableCell className="max-w-xs">{identity(login)}</TableCell>
                      <TableCell>{roleBadge(login)}</TableCell>
                      <TableCell>{login.employeeName ?? "–"}</TableCell>
                      <TableCell>
                        {login.linkedUserName ? (
                          <span className="inline-flex items-center gap-1.5">
                            {login.linkedUserName}
                            {login.autoLinked && (
                              <Badge variant="muted" className="text-[10px]">
                                {t("userAutoLinkedBadge")}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          "–"
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(login)}</TableCell>
                      <TableCell className="text-right">{rowMenu(login)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>

      <CreateLoginDialog
        open={creating}
        onOpenChange={setCreating}
        token={token}
        employees={employees ?? []}
        intranetUsers={intranetUsers ?? []}
        roles={roles ?? []}
      />
      <EditLoginDialog
        login={editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        token={token}
        employees={employees ?? []}
        intranetUsers={intranetUsers ?? []}
        roles={roles ?? []}
        viewerIsSuperAdmin={session.isSuperAdmin}
        viewerLoginId={session.loginId}
      />
      <ResetPasswordDialog
        loginId={resetting}
        onOpenChange={(o) => {
          if (!o) setResetting(null);
        }}
        token={token}
      />
    </PerformanceShell>
  );
}
