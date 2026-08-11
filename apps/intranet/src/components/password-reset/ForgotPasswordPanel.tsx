"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { KeyRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import posthog from "posthog-js";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type PasswordResetScope = "hr" | "performance";

/**
 * The "forgot your password?" affordance for the areas Clerk doesn't manage.
 * Only ever rendered by a lock screen *after* a failed attempt — offering it
 * up front would be an invitation to skip the password rather than remember
 * it.
 *
 * It resets nothing. All it does is put the account in front of an admin,
 * once per day, and say so plainly — the actual reset link is something an
 * admin issues afterwards, to the account holder's own inbox.
 */
export function ForgotPasswordPanel({
  scope,
  email,
  companySlug,
}: {
  scope: PasswordResetScope;
  /** The account in question. Ignored for `hr`, where the server takes the
   * caller's own identity instead of trusting a form field. */
  email?: string;
  companySlug?: string;
}) {
  const t = useTranslations("PasswordReset");
  const format = useFormatter();
  const requestReset = useMutation(api.passwordResets.requestReset);
  // Only `hr` callers are signed in; a Performance login screen on a tenant
  // domain has no Clerk session to answer this with.
  const hrState = useQuery(api.passwordResets.myHrRequestState, scope === "hr" ? {} : "skip");

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    posthog.capture("password_reset_forgot_shown", { scope });
  }, [scope]);

  const knownCooldown = cooldownUntil ?? hrState?.retryAt ?? null;
  const alreadyPending = sent || hrState?.pending === true;
  const contactEmail = hrState?.contactEmail ?? null;
  const time = (at: number) =>
    format.dateTime(new Date(at), {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function notify() {
    setSubmitting(true);
    setFailed(false);
    try {
      const result = await requestReset({
        scope,
        email: scope === "performance" ? email : undefined,
        companySlug,
      });
      if (result.status === "cooldown") {
        setCooldownUntil(result.retryAt);
      } else {
        setSent(true);
      }
      posthog.capture("password_reset_notify_clicked", { scope, outcome: result.status });
    } catch {
      setFailed(true);
      posthog.capture("password_reset_notify_clicked", { scope, outcome: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Alert className="text-left">
      <KeyRound />
      <AlertDescription className="space-y-3">
        <p className="font-medium text-foreground">{t("forgotTitle")}</p>
        <p className="text-muted-foreground">{t("forgotBody")}</p>

        {knownCooldown !== null ? (
          <p className="text-muted-foreground">{t("cooldown", { time: time(knownCooldown) })}</p>
        ) : alreadyPending ? (
          <p className="text-muted-foreground">{sent ? t("notified") : t("notifiedPending")}</p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={submitting || (scope === "performance" && !email?.trim())}
            onClick={() => void notify()}
          >
            {submitting ? t("notifySending") : t("notifyAdmins")}
          </Button>
        )}

        {failed && <p className="text-destructive">{t("notifyFailed")}</p>}
        {contactEmail && (
          <p className="text-xs text-muted-foreground">
            {t("contactHint", { email: contactEmail })}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
