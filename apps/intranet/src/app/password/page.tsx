"use client";

import { Suspense, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import posthog from "posthog-js";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Scope = "hr" | "performance";

const SCOPES: Scope[] = ["hr", "performance"];

/** Where to send someone once the new password is in place. */
const AFTER_RESET_HREF: Record<Scope, string> = {
  hr: "/applicants",
  performance: "/performance/login",
};

type Check =
  | { state: "checking" }
  | { state: "ok"; email: string; expiresAt: number }
  | { state: "bad"; reason: "invalid" | "expired" | "used" | "missing" };

/**
 * The one reset screen for every area that keeps its own password —
 * `/password?o=<area>&token=<token>`, rather than a `/hr/reset` and a
 * `/performance/reset` drifting apart. Deliberately outside the Clerk gate
 * and outside the tenant rewrite (see `proxy.ts`): a Performance user
 * resetting from their own company's domain has no intranet account to sign
 * into first, and the token is the only credential the page needs.
 */
function ResetForm() {
  const t = useTranslations("PasswordReset");
  const format = useFormatter();
  const params = useSearchParams();
  const checkToken = useAction(api.security.passwordResets.checkToken);
  const completeReset = useAction(api.security.passwordResets.completeReset);

  const rawScope = params.get("o");
  const scope = SCOPES.includes(rawScope as Scope) ? (rawScope as Scope) : null;
  const token = params.get("token");

  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!scope || !token) {
      setCheck({ state: "bad", reason: "missing" });
      return;
    }
    let cancelled = false;
    void checkToken({ scope, token }).then((result) => {
      if (cancelled) return;
      // Client-side breadcrumb for "the link didn't work" reports — scope and
      // verdict only, never the token itself.
      console.warn(`[passwordReset] link check scope=${scope} valid=${result.valid}`);
      posthog.capture("password_reset_link_opened", {
        scope,
        valid: result.valid,
        reason: result.valid ? null : result.reason,
      });
      setCheck(
        result.valid
          ? { state: "ok", email: result.email, expiresAt: result.expiresAt }
          : { state: "bad", reason: result.reason },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scope, token, checkToken]);

  async function submit() {
    if (!scope || !token) return;
    if (password.length < 8) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await completeReset({ scope, token, password });
      posthog.capture("password_reset_finished", { scope });
      setDone(true);
    } catch {
      // The only way this fails after a green check is the link having been
      // spent or revoked in the meantime — re-check so the page says which.
      const result = await checkToken({ scope, token });
      setCheck(
        result.valid
          ? { state: "ok", email: result.email, expiresAt: result.expiresAt }
          : { state: "bad", reason: result.reason },
      );
      setError(t("invalidBody"));
    } finally {
      setSubmitting(false);
    }
  }

  const areaLabel = scope === "hr" ? t("areaHr") : t("areaPerformance");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-6 text-primary" />
              <p className="font-semibold">{t("success")}</p>
              <Button asChild className="w-full">
                <Link href={AFTER_RESET_HREF[scope ?? "performance"]}>{t("goToLogin")}</Link>
              </Button>
            </div>
          ) : check.state === "checking" ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("checking")}</p>
          ) : check.state === "bad" ? (
            <div className="space-y-2 text-center">
              <ShieldAlert className="mx-auto size-6 text-destructive" />
              <p className="font-semibold">
                {check.reason === "expired"
                  ? t("expiredTitle")
                  : check.reason === "used"
                    ? t("usedTitle")
                    : t("invalidTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {check.reason === "missing"
                  ? t("missingToken")
                  : check.reason === "expired"
                    ? t("expiredBody")
                    : check.reason === "used"
                      ? t("usedBody")
                      : t("invalidBody")}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-center">
                <KeyRound className="mx-auto size-6 text-primary" />
                <p className="font-semibold">{t("resetTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("resetSubtitle", { area: areaLabel })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("resetAccount", { email: check.email })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                disabled={submitting || !password || !confirm}
                onClick={() => void submit()}
              >
                {submitting ? t("submitting") : t("submit")}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t("resetExpires", {
                  time: format.dateTime(new Date(check.expiresAt), {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PasswordResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
