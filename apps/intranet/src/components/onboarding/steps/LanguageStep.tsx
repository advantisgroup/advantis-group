"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { useLocale, useTranslations } from "next-intl";

import { LocaleFlag } from "@/components/icons/flags";
import { type Locale, locales } from "@/i18n/config";
import { setLocale } from "@/i18n/locale-action";
import { cn } from "@/lib/utils";

export function LanguageStep() {
  const t = useTranslations("Onboarding");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("languageTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("languageHint")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {locales.map(locale => (
          <button
            key={locale}
            type="button"
            disabled={pending}
            onClick={() => choose(locale)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors disabled:opacity-60",
              locale === current
                ? "border-primary/50 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LocaleFlag locale={locale} className="h-4 w-6" />
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
