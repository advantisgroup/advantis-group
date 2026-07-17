"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction, useQuery } from "convex/react";
import { KeyRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

export default function PerformancePasswordPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const handleError = useErrorHandler();
  const [token] = useState<string | null>(() => getPerformanceToken());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );
  const changeOwnPassword = useAction(api.performanceAuth.changeOwnPassword);

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  const mismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    !!token &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  async function handleSubmit() {
    if (!token || !canSubmit) return;
    setSaving(true);
    setDone(false);
    try {
      await changeOwnPassword({ token, currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <div className="flex-1" />
        <Link
          href={
            session.role === "admin"
              ? "/performance"
              : session.employeeId
                ? `/performance/mitarbeiter/${session.employeeId}`
                : "/performance"
          }
        >
          <Button variant="ghost" size="sm">
            {t("backToDashboard")}
          </Button>
        </Link>
        <SettingsMenu />
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-md space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              {t("passwordTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("passwordIntro")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("currentPasswordLabel")}
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userNewPasswordLabel")}
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("confirmPasswordLabel")}
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {mismatch && (
                <p className="text-xs text-destructive">
                  {t("passwordMismatch")}
                </p>
              )}
            </div>
            {done && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {t("passwordChanged")}
              </p>
            )}
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || saving}
              className="w-full"
            >
              {t("passwordSubmit")}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
