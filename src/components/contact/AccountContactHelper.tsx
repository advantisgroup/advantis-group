"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type AccountContactProfile } from "@/types/contact";

export function AccountContactHelper({
  accountProfile,
  onUseAccount,
}: {
  accountProfile: AccountContactProfile;
  onUseAccount: () => void;
}) {
  const t = useTranslations("contact.accountHelper");

  return (
    <div className="rounded-3xl border border-advantis/20 bg-advantis/5 p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-advantis/30 bg-advantis/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-advantis">
            <Sparkles className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("description")}
          </p>
          <div className="rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{accountProfile.fullName}</p>
            <p>{t("signedInAs", { email: accountProfile.email })}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("emailNote")}</p>
          </div>
        </div>

        <Button type="button" onClick={onUseAccount} className="w-full md:w-auto">
          {t("useAccount")}
        </Button>
      </div>
    </div>
  );
}
