"use client";

import { UserProfile } from "@clerk/nextjs";
import { ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const ClerkAccountPage = () => {
  const locale = useLocale();
  const t = useTranslations("auth");

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-background px-4 py-28">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-advantis/30 bg-advantis/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-advantis">
            {t("accountBadge")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("accountTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t("accountSubtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/account/submissions" locale={locale}>
              <ReceiptText className="mr-2 h-4 w-4" />
              {t("submissionsCta")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/contact" locale={locale}>
              {t("contactCta")}
            </Link>
          </Button>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/70 p-4 shadow-2xl shadow-black/20 backdrop-blur md:p-6 lg:p-8">
          <div className="mx-auto flex w-full justify-center">
            <div className="w-full max-w-[1100px] overflow-hidden rounded-[1.5rem] bg-white">
              <UserProfile path={`/${locale}/account`} routing="path" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
