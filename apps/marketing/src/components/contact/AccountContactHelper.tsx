"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type AccountContactProfile, type ButtonState } from "@/types/contact";

const buttonStyles: Record<ButtonState, string> = {
  idle: "",
  loading: "",
  success: "bg-emerald-600 text-white hover:bg-emerald-600",
  error: "",
};

export function AccountContactHelper({
  accountProfile,
  buttonState,
  onUseAccount,
}: {
  accountProfile: AccountContactProfile;
  buttonState: ButtonState;
  onUseAccount: () => void;
}) {
  const t = useTranslations("contact.accountHelper");
  const isSuccess = buttonState === "success";

  return (
    <div className="rounded-[2rem] border border-advantis/20 bg-linear-to-br from-advantis/10 via-advantis/5 to-background p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-advantis/30 bg-advantis/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-advantis">
            <Sparkles className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{accountProfile.fullName}</p>
            <p>{t("signedInAs", { email: accountProfile.email })}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("emailNote")}</p>
          </div>
          {isSuccess ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {t("successNotice")}
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          onClick={onUseAccount}
          className={`w-full md:w-auto ${buttonStyles[buttonState]}`.trim()}
        >
          {isSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              {t("useAccountSuccess")}
            </>
          ) : (
            t("useAccount")
          )}
        </Button>
      </div>
    </div>
  );
}
