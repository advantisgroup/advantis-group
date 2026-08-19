"use client";

import { ArrowRight, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Persistent shortcut into the new-employee onboarding flow — always
 *  visible like every other Overview panel, not a dismissible one-off
 *  announcement (that's what UpdateBanner is for). Single-row, not a full
 *  Panel — there's no body content here, just the header. */
export function NewEmployeeBanner() {
  const t = useTranslations("Admin");

  return (
    <Card className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
          <UserPlus />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{t("onboardBannerTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("onboardBannerDescription")}</p>
        </div>
      </div>
      <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
        <Link href="/admin/onboard">
          {t("onboardBannerCta")}
          <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      </Button>
    </Card>
  );
}
