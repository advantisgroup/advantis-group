"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of a route's content when the signed-in user lacks the
 * capability/role that route requires (e.g. non-managers hitting `/admin`).
 * Distinct from `AccessDeniedScreen`, which handles signed-in identities
 * outside the intranet's allowlist entirely and has no path forward.
 */
export function ForbiddenScreen() {
  const t = useTranslations("Forbidden");

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-7 w-7" />
        </span>
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("code")}
          </p>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">{t("backToDashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
