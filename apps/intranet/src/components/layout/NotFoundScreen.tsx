"use client";

import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/** Shown for any route (real or within the app shell) that doesn't resolve. */
export function NotFoundScreen({
  fullScreen,
  className,
}: {
  fullScreen?: boolean;
  className?: string;
}) {
  const t = useTranslations("NotFound");

  return (
    <StatusScreen
      fullScreen={fullScreen}
      className={className}
      icon={SearchX}
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
