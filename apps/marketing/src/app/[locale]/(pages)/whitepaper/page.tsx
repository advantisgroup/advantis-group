import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WhitepaperLanding } from "@/components/whitepaper/WhitepaperLanding";
import { type Locale } from "@/i18n/request";
import { localeAlternates } from "@/lib/seo";
import { whitepaperExists } from "@/lib/whitepaper";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "whitepaper.meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates(locale, "/whitepaper"),
  };
}

export default function WhitepaperPage() {
  // Resolved on the server so the form is never shown for a document that
  // isn't in the repo yet — see apps/marketing/private/README.md.
  return <WhitepaperLanding available={whitepaperExists()} />;
}
