import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const controlClassName =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm";

// zod's messages are English-only, so the form shows its own localized line instead
export const useFieldError = (errors: Partial<Record<string, string[]>>) => {
  const t = useTranslations("contact.form.errors");
  return (field: string) =>
    errors[field] ? (field === "email" ? t("email") : t("required")) : undefined;
};

export const PrivacyNote = ({ callback = false }: { callback?: boolean }) => {
  const t = useTranslations("contact.form");

  return (
    <p className="text-[13px] leading-relaxed text-muted-foreground">
      {t("privacyPrefix")} advantis GmbH{" "}
      {callback ? t("privacySuffixCallback") : t("privacySuffix")}{" "}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
        {t("privacyLink")}
      </Link>
    </p>
  );
};

export const Field = ({
  id,
  label,
  optional = false,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) => {
  const t = useTranslations("contact.otherForm");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-muted-foreground">({t("optional")})</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
};
