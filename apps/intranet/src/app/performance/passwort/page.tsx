"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { clearPerformanceToken } from "@/lib/performanceAuth";

export default function PerformancePasswordPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const handleError = useErrorHandler();
  const { token, session } = usePerformanceSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const changeOwnPassword = useAction(api.performanceAuth.changeOwnPassword);

  useEffect(() => {
    // Wait for the query to resolve — a visitor with no password cookie may
    // still resolve via their linked Clerk identity.
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    // Clerk-linked accounts have no password to change — this page doesn't
    // apply to them (the nav entry that links here is already hidden).
    if (session.viaClerk) router.replace("/performance");
  }, [session, router]);

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  const mismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  async function handleSubmit() {
    if (!canSubmit) return;
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
  if (!session.valid || session.viaClerk) return null;

  const navItems = [
    {
      href:
        session.role === "admin"
          ? "/performance"
          : session.employeeId
            ? `/performance/mitarbeiter/${session.employeeId}`
            : "/performance",
      label: t("backToDashboard"),
    },
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader navItems={navItems} onExit={exit} />

      <main className="mx-auto max-w-md space-y-6 p-4 pb-24 md:p-6">
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
      <PerformanceBottomTabs navItems={navItems} onExit={exit} />
    </div>
  );
}
