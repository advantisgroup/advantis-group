"use client";

import { UserProfile } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";

export const ClerkAccountPage = () => {
  const locale = useLocale();
  const t = useTranslations("auth");

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-background px-4 py-28">
      <div className="mx-auto max-w-5xl space-y-4">
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

        <div className="overflow-hidden rounded-[2rem] border border-border bg-card/70 p-4 shadow-2xl shadow-black/20 backdrop-blur md:p-6">
          <UserProfile path={`/${locale}/account`} routing="path" />
        </div>
      </div>
    </section>
  );
};
