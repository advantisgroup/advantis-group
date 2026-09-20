import { useTranslations } from "next-intl";

import { LegalLayout } from "@/components/legal/LegalLayout";
import { CookiePreferences } from "@/components/privacy/CookiePreferences";
import { Link } from "@/i18n/navigation";

export default function CookiesPage() {
  const t = useTranslations("cookiePreferences");

  return (
    <LegalLayout title={t("title")} description={t("description")}>
      <div className="max-w-3xl">
        <CookiePreferences />

        <p className="mt-10 border-t border-rule pt-8 text-sm text-muted-foreground">
          {t("privacyHint")}{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            {t("privacyLink")}
          </Link>
        </p>
      </div>
    </LegalLayout>
  );
}
