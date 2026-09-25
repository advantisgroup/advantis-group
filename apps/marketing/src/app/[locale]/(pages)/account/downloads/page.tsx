import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DownloadsPage } from "@/components/account/DownloadsPage";
import { loadConsents } from "@/lib/inquiries-server";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.nav" });
  return { title: t("downloads") };
}

export default async function Downloads() {
  return <DownloadsPage consents={await loadConsents()} />;
}
