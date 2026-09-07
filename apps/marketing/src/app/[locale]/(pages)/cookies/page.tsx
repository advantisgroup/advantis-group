import { useTranslations } from "next-intl";

import { Display, PageField } from "@/components/frame";
import { CookiePreferences } from "@/components/privacy/CookiePreferences";
import { Link } from "@/i18n/navigation";

export default function CookiesPage() {
  const t = useTranslations("cookiePreferences");

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <main className="relative mx-auto w-full max-w-3xl px-5 pb-24 pt-32 md:px-10 md:pt-44">
        <header>
          <Display as="h1" size="lg">
            {t("title")}
          </Display>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("description")}</p>
        </header>

        <div className="mt-12">
          <CookiePreferences />
        </div>

        <p className="mt-10 border-t border-rule pt-8 text-sm text-muted-foreground">
          {t("privacyHint")}{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            {t("privacyLink")}
          </Link>
        </p>
      </main>
    </div>
  );
}
