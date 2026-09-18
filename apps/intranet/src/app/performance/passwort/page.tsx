"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { PerformanceShell, usePerformanceGate } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/use-error-handler";

export default function PerformancePasswordPage() {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  // Clerk-linked accounts have no password to change.
  const { token, loading, session } = usePerformanceGate((s) => !s.viaClerk);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const changeOwnPassword = useAction(api.performance.auth.changeOwnPassword);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

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

  if (loading) return <PerformancePageSkeleton />;
  if (!session) return null;

  return (
    <PerformanceShell title={t("passwordTitle")} description={t("passwordIntro")} width="max-w-xl">
      <Card>
        <CardContent className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{t("currentPasswordLabel")}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 border-t border-border/70 pt-4">
              <Label htmlFor="new-password">{t("userNewPasswordLabel")}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setDone(false);
                }}
              />
              {tooShort && <p className="text-xs text-muted-foreground">{t("passwordTooShort")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">{t("confirmPasswordLabel")}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {mismatch && <p className="text-xs text-destructive">{t("passwordMismatch")}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              {done && (
                <p className="mr-auto flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("passwordChanged")}
                </p>
              )}
              <Button type="submit" disabled={!canSubmit || saving}>
                {t("passwordSubmit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PerformanceShell>
  );
}
