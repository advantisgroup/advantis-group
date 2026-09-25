import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PreferencesPage } from "@/components/account/PreferencesPage";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.nav" });
  return { title: t("preferences") };
}

export default function Preferences() {
  return <PreferencesPage />;
}
