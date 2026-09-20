"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type AccountContactProfile, type ButtonState } from "@/types/contact";

const buttonStyles: Record<ButtonState, string> = {
  idle: "",
  loading: "",
  success: "bg-success text-success-foreground hover:bg-success",
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
    <div className="rounded-xl border border-rule bg-card p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-rule-strong px-3 py-1 text-[13px] font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
          </div>
          <div className="rounded-lg border border-rule bg-background px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{accountProfile.fullName}</p>
            <p>{t("signedInAs", { email: accountProfile.email })}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("emailNote")}</p>
          </div>
          {isSuccess ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-sm font-medium text-success-foreground dark:text-success">
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
