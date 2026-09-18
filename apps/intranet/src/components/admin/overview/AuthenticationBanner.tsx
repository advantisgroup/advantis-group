"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Persistent shortcut into the org auth policy console, mirroring
 * `NewEmployeeBanner`'s "always visible, not a dismissible one-off" shape.
 * Shows the current posture plus the live non-compliant count, so an admin
 * knows at a glance whether anything needs their attention without opening
 * the console. */
export function AuthenticationBanner() {
  const t = useTranslations("Admin");
  const policy = useQuery(api.security.stepUp.orgPolicy);
  const standard = useQuery(api.security.stepUp.orgStandard);

  const summary = (() => {
    if (!policy) return null;
    const parts: string[] = [];
    if (policy.requireMfaScope !== "off") {
      parts.push(
        policy.requireMfaScope === "all"
          ? t("authenticationBannerMfaAll")
          : t("authenticationBannerMfaManagers"),
      );
    }
    if (policy.requirePasskeyScope !== "off") {
      parts.push(
        policy.requirePasskeyScope === "all"
          ? t("authenticationBannerPasskeyAll")
          : t("authenticationBannerPasskeyManagers"),
      );
    }
    if (standard && standard.nonCompliant.length > 0) {
      parts.push(t("authenticationBannerNonCompliant", { count: standard.nonCompliant.length }));
    }
    return parts.length > 0 ? parts.join(" · ") : t("authenticationBannerNone");
  })();

  return (
    <Card className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
          <ShieldAlert />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{t("authenticationBannerTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary ?? t("authenticationBannerLoading")}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="w-full shrink-0 sm:w-auto">
        <Link href="/admin/authentication">
          {t("authenticationBannerCta")}
          <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      </Button>
    </Card>
  );
}
