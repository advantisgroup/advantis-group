"use client";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Non-blocking nudge for a policy still inside its grace period — the
 * counterpart to `StepUpScreen`'s hard block. Same "always visible while
 * relevant, not a one-off dismissible" shape as `SandboxBanner`, right next
 * to it in `AppShell`. */
export function GracePeriodBanner() {
  const t = useTranslations("StepUp");
  const format = useFormatter();
  const { sessionId } = useAuth();
  const status = useQuery(api.security.stepUp.status, sessionId ? { sessionId } : "skip");

  if (!status || status.state !== "warning") return null;

  return (
    <Alert className="flex items-center gap-3 rounded-none border-x-0 border-t-0 border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-foreground [&>svg]:static [&>svg+div]:translate-y-0 [&>svg~*]:pl-0">
      <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {t("graceBannerBody", {
            date: format.dateTime(new Date(status.graceDeadline), {
              day: "2-digit",
              month: "short",
            }),
          })}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Link
            href="/guidebooks/sicherheitsanmeldung"
            className="text-sm font-medium text-amber-700 underline underline-offset-2 hover:opacity-80 dark:text-amber-400"
          >
            {t("graceBannerHelp")}
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link
              href={
                status.needsPasskeyEnrollment
                  ? "/settings/account#passkeys"
                  : "/settings/account#totp"
              }
            >
              {t("graceBannerCta")}
            </Link>
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
