"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { LineChart, Loader2, ShieldCheck, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { StepUpForm } from "@/components/auth/StepUpForm";
import { Link } from "@/components/Link";
import { ForgotPasswordPanel } from "@/components/password-reset/ForgotPasswordPanel";
import { PerformanceBrandMark } from "@/components/performance/PerformanceBrandMark";
import { usePerformanceCompanySlug } from "@/components/performance/PerformanceCompanyProvider";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPerformanceToken } from "@/lib/performanceAuth";

/**
 * Phase 8 of docs/future-features/21_auth-consolidation.md: a persistent,
 * dismissible notice — not the hard block above, since the standalone
 * password is still valid throughout the grace period. Dismissal is scoped
 * to this specific deadline (in localStorage) so re-enabling the sunset
 * later, with a new deadline, shows it again rather than staying silenced
 * forever from one earlier dismissal.
 */
function LegacyPasswordSunsetNotice() {
  const t = useTranslations("Performance");
  const format = useFormatter();
  const notice = useQuery(api.performanceAuth.legacyPasswordSunsetNotice);
  const [dismissedDeadline, setDismissedDeadline] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("performance-legacy-password-notice-dismissed");
      if (raw) setDismissedDeadline(Number(raw));
    } catch {
      // Private window or blocked storage — the notice just shows every visit.
    }
  }, []);

  if (!notice?.enabled || notice.deadlineAt === null) return null;
  if (dismissedDeadline === notice.deadlineAt) return null;

  function dismiss() {
    if (!notice?.deadlineAt) return;
    setDismissedDeadline(notice.deadlineAt);
    try {
      window.localStorage.setItem(
        "performance-legacy-password-notice-dismissed",
        String(notice.deadlineAt),
      );
    } catch {
      // Nothing to persist across visits — still dismisses for this one.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-foreground">
      <span className="min-w-0 flex-1">
        {t("loginLegacyPasswordNotice", {
          date: format.dateTime(new Date(notice.deadlineAt), { day: "2-digit", month: "short" }),
        })}
      </span>
      <button
        type="button"
        aria-label={t("loginLegacyPasswordNoticeDismiss")}
        onClick={dismiss}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export default function PerformanceLoginPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const slug = usePerformanceCompanySlug();
  const login = useAction(api.performanceAuth.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Only offered once the password has actually been got wrong.
  const [attemptFailed, setAttemptFailed] = useState(false);

  // Phase 3 of docs/future-features/21_auth-consolidation.md: someone whose
  // Performance login is linked to their intranet account, and who's
  // already signed into the intranet in this browser, never needs to see a
  // password field at all — `usePerformanceSession` resolves them straight
  // from their Clerk identity (see `performanceAuth.ts`'s
  // `resolveClerkLinkedLogin`), the same way it already does for every
  // other Performance page. Bounce straight past the login form instead of
  // asking for a credential that was never required.
  const { session } = usePerformanceSession();
  useEffect(() => {
    if (session?.valid) router.replace("/performance");
  }, [session, router]);

  async function submit() {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ slug, email, password });
      setPerformanceToken(result.token, result.expiresAt);
      router.replace("/performance");
    } catch (err) {
      const code =
        err instanceof ConvexError && typeof err.data === "object" && err.data !== null
          ? (err.data as { code?: string }).code
          : undefined;
      setError(
        code === "legacy_password_sunset" ? t("loginLegacyPasswordSunset") : t("loginInvalid"),
      );
      setAttemptFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  // Undefined while `validateSession` is still in flight, or `valid` while
  // the redirect above fires — either way, nothing worth rendering yet.
  if (session === undefined || session.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Phase 7 of docs/future-features/21_auth-consolidation.md: this Clerk
  // identity IS linked to a Performance login, but its 14-day
  // re-verification window lapsed — a password form would be a dead end for
  // an account that may never have set one. `validateSession` is a live
  // Convex query, so clearing this re-renders straight into the redirect
  // effect above once it does, with no manual refetch needed.
  if (session.needsAreaStepUp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <PerformanceBrandMark className="mb-4" />
            <ShieldCheck className="mb-2 size-6 text-primary" />
            <CardTitle>{t("reverifyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <StepUpForm
              availableMethods={session.availableMethods}
              context="area_reverify"
              area="performance"
              // No-op: `validateSession` above is a live query, so clearing
              // this re-renders into the redirect effect on its own.
              onVerified={() => {}}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <PerformanceBrandMark className="mb-4" />
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            {t("loginTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("loginIntro")}</p>
          {/* Only Advantis logins can ever be linked to an intranet account
              (see `showIntranetLink` in LoginDialogs.tsx) — shown to everyone
              on that tenant rather than only to accounts we know are linked,
              since `requestReset`/`resolveTarget` deliberately never reveals
              that over the wire (no account-existence oracle). */}
          {slug === "advantis" && (
            <>
              <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t("loginIntranetHint")}{" "}
                <Link href="/performance" className="font-medium underline underline-offset-2">
                  {t("loginIntranetLink")}
                </Link>
              </p>
              <LegacyPasswordSunsetNotice />
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="performance-email">{t("emailLabel")}</Label>
            <Input
              id="performance-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="performance-password">{t("passwordLabel")}</Label>
            <Input
              id="performance-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={submitting || !email.trim() || !password}
            onClick={() => void submit()}
          >
            {t("loginSubmit")}
          </Button>
          {attemptFailed && (
            <ForgotPasswordPanel scope="performance" email={email} companySlug={slug} />
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/performance/setup" className="underline underline-offset-4">
              {t("setupLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
