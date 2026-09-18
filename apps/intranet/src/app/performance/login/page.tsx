"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { StepUpForm } from "@/components/auth/StepUpForm";
import { Link } from "@/components/Link";
import { ForgotPasswordPanel } from "@/components/password-reset/ForgotPasswordPanel";
import { PerformanceBrandMark } from "@/components/performance/PerformanceBrandMark";
import { usePerformanceCompanySlug } from "@/components/performance/PerformanceCompanyProvider";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPerformanceToken } from "@/lib/performanceAuth";

const NOTICE_DISMISSED_KEY = "performance-legacy-password-notice-dismissed";

function LoginShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <PerformanceBrandMark />
        </div>
        <h1 className="mt-10 text-center font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {intro && (
          <p className="mt-2 text-center text-sm text-muted-foreground text-pretty">{intro}</p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

// Dismissal is keyed to the deadline itself, so a later, different deadline
// shows again instead of staying silenced by an old dismissal.
function LegacyPasswordNotice() {
  const t = useTranslations("Performance");
  const format = useFormatter();
  const notice = useQuery(api.performance.auth.legacyPasswordSunsetNotice);
  const [dismissed, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTICE_DISMISSED_KEY);
      if (raw) setDismissed(Number(raw));
    } catch {
      // Blocked storage just means the notice shows every visit.
    }
  }, []);

  const deadline = notice?.deadlineAt ?? null;
  if (deadline === null || deadline < Date.now() || dismissed === deadline) return null;

  function dismiss() {
    setDismissed(deadline);
    try {
      window.localStorage.setItem(NOTICE_DISMISSED_KEY, String(deadline));
    } catch {
      // Still dismissed for this visit.
    }
  }

  return (
    <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
      <span className="min-w-0 flex-1 text-pretty">
        {t("loginLegacyPasswordNotice", {
          date: format.dateTime(new Date(deadline), {
            day: "numeric",
            month: "long",
          }),
        })}
      </span>
      <button
        type="button"
        aria-label={t("loginLegacyPasswordNoticeDismiss")}
        onClick={dismiss}
        className="-mr-1 shrink-0 rounded-md p-1 hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </p>
  );
}

export default function PerformanceLoginPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const slug = usePerformanceCompanySlug();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const login = useAction(api.performance.auth.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // "Forgot password" only shows up once a password has actually been wrong.
  const [attemptFailed, setAttemptFailed] = useState(false);

  // A linked intranet account that's already signed in never needs this form.
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

  if (session === undefined || session.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Linked, but the re-verification window lapsed. `validateSession` is live,
  // so passing this re-renders straight into the redirect above.
  if (session.needsAreaStepUp) {
    return (
      <LoginShell title={t("reverifyTitle")}>
        <StepUpForm
          availableMethods={session.availableMethods}
          context="area_reverify"
          area="performance"
          onVerified={() => {}}
        />
      </LoginShell>
    );
  }

  // Only Advantis logins can be linked to an intranet account. Someone
  // already signed into the intranet and still here isn't linked, so the
  // button would only bring them straight back.
  const offerIntranet = slug === "advantis" && clerkLoaded && !isSignedIn;

  return (
    <LoginShell title={t("loginTitle")} intro={t("loginIntro")}>
      <div className="space-y-5">
        {offerIntranet && (
          <>
            <Button variant="outline" className="h-10 w-full" asChild>
              <a href={`/sign-in?redirect_url=${encodeURIComponent("/performance")}`}>
                {t("loginIntranetLink")}
              </a>
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              {t("loginOr")}
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="performance-email">{t("emailLabel")}</Label>
            <Input
              id="performance-email"
              type="email"
              autoComplete="username"
              className="h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="performance-password">{t("passwordLabel")}</Label>
            <Input
              id="performance-password"
              type="password"
              autoComplete="current-password"
              className="h-10"
              value={password}
              aria-invalid={!!error}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-10 w-full"
            disabled={submitting || !email.trim() || !password}
          >
            {submitting && <Loader2 className="animate-spin" />}
            {t("loginSubmit")}
          </Button>
        </form>

        {attemptFailed && (
          <ForgotPasswordPanel scope="performance" email={email} companySlug={slug} />
        )}
        {slug === "advantis" && <LegacyPasswordNotice />}

        <p className="pt-2 text-center text-[13px] text-muted-foreground">
          <Link
            href="/performance/setup"
            className="underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground"
          >
            {t("setupLink")}
          </Link>
        </p>
      </div>
    </LoginShell>
  );
}
