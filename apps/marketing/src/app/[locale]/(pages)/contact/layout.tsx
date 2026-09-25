import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/lib/seo";

// only here because the page itself is a client component and can't export metadata
// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), alternates: localeAlternates(locale, "/contact") };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
