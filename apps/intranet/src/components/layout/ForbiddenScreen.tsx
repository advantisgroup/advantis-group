"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of a route's content when the signed-in user lacks the
 * capability/role that route requires (e.g. non-managers hitting `/admin`).
 * Distinct from `AccessDeniedScreen`, which handles signed-in identities
 * outside the intranet's allowlist entirely and has no path forward.
 */
export function ForbiddenScreen({
  fullScreen,
  className,
}: {
  fullScreen?: boolean;
  className?: string;
}) {
  const t = useTranslations("Forbidden");

  return (
    <StatusScreen
      fullScreen={fullScreen}
      className={className}
      icon={Lock}
      code={t("code")}
      title={t("title")}
      description={t("description")}
      action={
        <Button asChild variant="outline">
          <Link href="/">{t("backToDashboard")}</Link>
        </Button>
      }
    />
  );
}
