"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { KeyRound, LogOut, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { BackToIntranetLink } from "@/components/performance/BackToIntranetLink";
import {
  CreateLoginDialog,
  EditLoginDialog,
  type LoginRow,
  ResetPasswordDialog,
} from "@/components/performance/LoginDialogs";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { clearPerformanceToken } from "@/lib/performanceAuth";

export default function PerformanceUsersPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LoginRow | null>(null);
  const [resetting, setResetting] = useState<Id<"performanceLogins"> | null>(
    null
  );

  useEffect(() => {
    // Wait for the query to resolve — a visitor with no password cookie may
    // still resolve via their linked Clerk identity.
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    if (session.role !== "admin") router.replace("/performance");
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const logins = useQuery(
    api.performanceAuth.listLogins,
    isAdmin ? { token } : "skip"
  );
  const employees = useQuery(
    api.performanceAuth.listEmployeesForLink,
    isAdmin ? { token } : "skip"
  );
  const intranetUsers = useQuery(
    api.performanceAuth.listIntranetUsersForLink,
    isAdmin ? { token } : "skip"
  );

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || session.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <BackToIntranetLink />
        <div className="flex-1" />
        <Link href="/performance">
          <Button variant="ghost" size="sm">
            {t("backToDashboard")}
          </Button>
        </Link>
        <PerformanceAccountMenu />
        <SettingsMenu />
        {!session.viaClerk && (
          <Button variant="ghost" size="sm" onClick={exit}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("exit")}
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("usersTitle")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("usersIntro")}
              </p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("userNew")}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {logins === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : logins.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("usersEmpty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nameLabel")}</TableHead>
                    <TableHead>{t("emailLabel")}</TableHead>
                    <TableHead>{t("userRoleLabel")}</TableHead>
                    <TableHead>{t("userEmployeeLabel")}</TableHead>
                    <TableHead>{t("userIntranetAccountLabel")}</TableHead>
                    <TableHead>{t("userStatusLabel")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logins.map(login => (
                    <TableRow key={login.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {login.name}
                          {session.valid && login.id === session.loginId && (
                            <Badge variant="muted" className="text-[10px]">
                              {t("userYouBadge")}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate">
                        {login.email}
                      </TableCell>
                      <TableCell>
                        {login.role === "admin"
                          ? t("userRoleAdmin")
                          : t("userRoleEmployee")}
                      </TableCell>
                      <TableCell>{login.employeeName ?? "–"}</TableCell>
                      <TableCell>{login.linkedUserName ?? "–"}</TableCell>
                      <TableCell>
                        <Badge variant={login.active ? "success" : "muted"}>
                          {login.active
                            ? t("userActiveLabel")
                            : t("userInactiveLabel")}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditing(login)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("userEditTooltip")}
                          </TooltipContent>
                        </Tooltip>
                        {session.valid && login.id === session.loginId ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link href="/performance/passwort">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("userResetPasswordSelfTooltip")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setResetting(login.id)}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("userResetPasswordTooltip")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {session.valid && (
        <>
          <CreateLoginDialog
            open={creating}
            onOpenChange={setCreating}
            token={token}
            employees={employees ?? []}
            intranetUsers={intranetUsers ?? []}
          />
          <EditLoginDialog
            login={editing}
            onOpenChange={o => {
              if (!o) setEditing(null);
            }}
            token={token}
            employees={employees ?? []}
            intranetUsers={intranetUsers ?? []}
          />
          <ResetPasswordDialog
            loginId={resetting}
            onOpenChange={o => {
              if (!o) setResetting(null);
            }}
            token={token}
          />
        </>
      )}
    </div>
  );
}
