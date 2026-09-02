import { Suspense } from "react";

import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WhitepaperConfirm } from "@/components/whitepaper/WhitepaperConfirm";
import { type Locale } from "@/i18n/request";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "whitepaper.confirm" });

  return { title: t("title"), description: t("description") };
}

export default function WhitepaperConfirmPage() {
  return (
    <Suspense>
      <WhitepaperConfirm />
    </Suspense>
  );
}
