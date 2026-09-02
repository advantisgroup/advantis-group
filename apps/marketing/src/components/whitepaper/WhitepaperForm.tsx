"use client";

import { CheckCircle2, Download, Info, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { Button } from "@/components/ui/button";
import { useWhitepaperRequest } from "@/hooks/use-whitepaper-request";
import { Link } from "@/i18n/navigation";
import { type WhitepaperFormData } from "@/types/contact";

const FIELD_CLASS =
  "w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base";

export function WhitepaperForm() {
  const t = useTranslations("whitepaper.form");
  const tSuccess = useTranslations("whitepaper.success");
  const {
    formData,
    setFormData,
    errors,
    buttonState,
    formError,
    submittedEmail,
    handleSubmit,
    reset,
  } = useWhitepaperRequest();

  const update = (patch: Partial<WhitepaperFormData>) => setFormData({ ...formData, ...patch });
  const fieldError = (field: keyof WhitepaperFormData) =>
    errors[field] ? t(field === "email" ? "errors.email" : "errors.required") : null;

  if (submittedEmail) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-3">
          <MailCheck className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-xl font-semibold text-foreground">{tSuccess("title")}</h3>
        </div>
        <p className="text-base text-muted-foreground">
          {tSuccess("description", { email: submittedEmail })}
        </p>
        <p className="text-sm text-muted-foreground">{tSuccess("spamHint")}</p>
        <Button type="button" variant="outline" onClick={reset}>
          {tSuccess("again")}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="wp-company" className="mb-2 block text-sm font-medium">
          {t("company")} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="wp-company"
          autoComplete="organization"
          value={formData.company}
          onChange={(e) => update({ company: e.target.value })}
          className={FIELD_CLASS}
        />
        {fieldError("company") && (
          <p className="mt-1 text-sm text-red-500">{fieldError("company")}</p>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full md:w-1/2">
          <label htmlFor="wp-firstName" className="mb-2 block text-sm font-medium">
            {t("firstName")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="wp-firstName"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            className={FIELD_CLASS}
          />
          {fieldError("firstName") && (
            <p className="mt-1 text-sm text-red-500">{fieldError("firstName")}</p>
          )}
        </div>
        <div className="w-full md:w-1/2">
          <label htmlFor="wp-lastName" className="mb-2 block text-sm font-medium">
            {t("lastName")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="wp-lastName"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={(e) => update({ lastName: e.target.value })}
            className={FIELD_CLASS}
          />
          {fieldError("lastName") && (
            <p className="mt-1 text-sm text-red-500">{fieldError("lastName")}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full md:w-1/2">
          <label htmlFor="wp-email" className="mb-2 block text-sm font-medium">
            {t("email")} <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="wp-email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => update({ email: e.target.value })}
            className={FIELD_CLASS}
          />
          {fieldError("email") && (
            <p className="mt-1 text-sm text-red-500">{fieldError("email")}</p>
          )}
        </div>
        <div className="w-full md:w-1/2">
          <label htmlFor="wp-phone" className="mb-2 block text-sm font-medium">
            {t("phone")} <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="wp-phone"
            autoComplete="tel"
            placeholder={t("phonePlaceholder")}
            value={formData.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className={FIELD_CLASS}
          />
          {fieldError("phone") && (
            <p className="mt-1 text-sm text-red-500">{fieldError("phone")}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="wp-consent" className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            id="wp-consent"
            checked={formData.consent}
            onChange={(e) => update({ consent: e.target.checked })}
            className="mt-1 h-4 w-4 shrink-0 accent-advantis"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            {t("consent")} {t("consentSuffix")}{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              {t("consentLink")}
            </Link>
          </span>
        </label>
        {errors.consent && <p className="text-sm text-red-500">{t("errors.consent")}</p>}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t("doubleOptIn")}</p>
      </div>

      {formError && <p className="text-sm text-red-500">{formError}</p>}

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <BrandText brand="advantis">advantis GmbH</BrandText> &middot;{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            {t("consentLink")}
          </Link>
        </p>
        <AnimatedButton buttonState={buttonState} idleText={t("submit")} idleIcon={Download} />
      </div>
    </form>
  );
}

export function WhitepaperUnavailable() {
  const t = useTranslations("whitepaper.unavailable");

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-advantis" />
        <h3 className="text-xl font-semibold text-foreground">{t("title")}</h3>
      </div>
      <p className="text-base text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/contact">{t("cta")}</Link>
      </Button>
    </div>
  );
}
