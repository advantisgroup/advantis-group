"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { KeyRound, LogOut, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  CreateLoginDialog,
  EditLoginDialog,
  type LoginRow,
  ResetPasswordDialog,
} from "@/components/performance/LoginDialogs";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

export default function PerformanceUsersPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const [token] = useState<string | null>(() => getPerformanceToken());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LoginRow | null>(null);
  const [resetting, setResetting] = useState<Id<"performanceLogins"> | null>(
    null
  );

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  useEffect(() => {
    if (session?.valid && session.role !== "admin")
      router.replace("/performance");
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const logins = useQuery(
    api.performanceAuth.listLogins,
    token && isAdmin ? { token } : "skip"
  );
  const employees = useQuery(
    api.performanceAuth.listEmployeesForLink,
    token && isAdmin ? { token } : "skip"
  );

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (!session?.valid || session.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <div className="flex-1" />
        <Link href="/performance">
          <Button variant="ghost" size="sm">
            {t("backToDashboard")}
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("usersTitle")}</CardTitle>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("userNew")}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!logins || logins.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("usersEmpty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nameLabel")}</TableHead>
                    <TableHead>{t("emailLabel")}</TableHead>
                    <TableHead>{t("userRoleLabel")}</TableHead>
                    <TableHead>{t("userEmployeeLabel")}</TableHead>
                    <TableHead>{t("userStatusLabel")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logins.map(login => (
                    <TableRow key={login.id}>
                      <TableCell className="font-medium">
                        {login.name}
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
                      <TableCell>
                        <Badge variant={login.active ? "success" : "muted"}>
                          {login.active
                            ? t("userActiveLabel")
                            : t("userInactiveLabel")}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditing(login)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setResetting(login.id)}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {token && (
        <>
          <CreateLoginDialog
            open={creating}
            onOpenChange={setCreating}
            token={token}
            employees={employees ?? []}
          />
          <EditLoginDialog
            login={editing}
            onOpenChange={o => {
              if (!o) setEditing(null);
            }}
            token={token}
            employees={employees ?? []}
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
