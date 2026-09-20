"use client";

import { ArrowRight, Download, MailCheck, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { Button } from "@/components/ui/button";
import { useWhitepaperRequest } from "@/hooks/use-whitepaper-request";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { type WhitepaperFormData } from "@/types/contact";

const FIELD_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-4 text-base transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-rule-strong focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";

const LABEL_CLASS = "mb-2 block text-sm font-medium text-foreground";

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
  const errorFor = (field: keyof WhitepaperFormData) => {
    if (!errors[field]) return null;
    // An empty address is a blank field, not a malformed one.
    if (field === "email" && formData.email.trim()) return t("errors.email");
    return t("errors.required");
  };

  if (submittedEmail) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <MailCheck className="h-6 w-6 text-success-foreground dark:text-success" />
        </span>
        <div className="space-y-2">
          <h3 className="text-2xl">{tSuccess("title")}</h3>
          <p className="text-base leading-relaxed text-muted-foreground">
            {tSuccess.rich("description", {
              email: submittedEmail,
              b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </p>
        </div>
        <p className="rounded-xl border border-rule bg-muted/40 p-3 text-sm text-muted-foreground">
          {tSuccess("spamHint")}
        </p>
        <Button type="button" variant="ghost" onClick={reset} className="text-muted-foreground">
          {tSuccess("again")}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <Field
        id="wp-company"
        label={t("company")}
        error={errorFor("company")}
        autoComplete="organization"
        value={formData.company}
        onChange={(value) => update({ company: value })}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="wp-firstName"
          label={t("firstName")}
          error={errorFor("firstName")}
          autoComplete="given-name"
          value={formData.firstName}
          onChange={(value) => update({ firstName: value })}
        />
        <Field
          id="wp-lastName"
          label={t("lastName")}
          error={errorFor("lastName")}
          autoComplete="family-name"
          value={formData.lastName}
          onChange={(value) => update({ lastName: value })}
        />
      </div>

      <Field
        id="wp-email"
        type="email"
        label={t("email")}
        error={errorFor("email")}
        autoComplete="email"
        value={formData.email}
        onChange={(value) => update({ email: value })}
      />

      <Field
        id="wp-phone"
        type="tel"
        label={t("phone")}
        error={errorFor("phone")}
        autoComplete="tel"
        placeholder={t("phonePlaceholder")}
        value={formData.phone}
        onChange={(value) => update({ phone: value })}
      />

      <div
        className={cn(
          "rounded-xl border p-4 transition-colors",
          errors.consent ? "border-red-500/50 bg-red-500/5" : "border-rule bg-muted/30",
        )}
      >
        <label htmlFor="wp-consent" className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            id="wp-consent"
            checked={formData.consent}
            onChange={(event) => update({ consent: event.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-advantis"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            {t("consent")} {t("consentSuffix")}{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 decoration-rule-strong hover:decoration-foreground"
            >
              {t("consentLink")}
            </Link>
            .
          </span>
        </label>
        {errors.consent && <p className="mt-2 text-sm text-red-500">{t("errors.consent")}</p>}
      </div>

      {formError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          {formError}
        </p>
      )}

      <div className="space-y-3 pt-1">
        <AnimatedButton
          buttonState={buttonState}
          idleText={t("submit")}
          idleIcon={Download}
          className="h-12 text-base"
        />
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {t("noThirdParty")}
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  error: string | null;
  type?: "text" | "email" | "tel";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label} <span className="text-primary">*</span>
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={cn(FIELD_CLASS, error && "border-red-500/60 focus:ring-red-500/10")}
      />
      {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
    </div>
  );
}

export function WhitepaperUnavailable() {
  const t = useTranslations("whitepaper.unavailable");

  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
        <Download className="size-6 text-muted-foreground" />
      </span>
      <div className="space-y-2">
        <h3 className="text-2xl">{t("title")}</h3>
        <p className="text-base leading-relaxed text-muted-foreground">{t("description")}</p>
      </div>
      <Button asChild variant="outline" className="group">
        <Link href="/contact">
          {t("cta")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </div>
  );
}
