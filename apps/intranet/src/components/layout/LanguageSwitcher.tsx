"use client";

import { Languages } from "lucide-react";
import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { useLocale } from "next-intl";

import { setLocale } from "@/i18n/locale-action";
import { type Locale, locales } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<Locale, string> = { de: "Deutsch", en: "English" };

export function LanguageSwitcher() {
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Language" disabled={pending}>
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => choose(locale)}
            className={current === locale ? "font-semibold" : undefined}
          >
            {LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
