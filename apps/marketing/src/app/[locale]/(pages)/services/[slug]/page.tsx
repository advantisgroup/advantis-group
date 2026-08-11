import { notFound } from "next/navigation";

import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ServiceLandingPage } from "@/components/sections/services/ServiceLandingPage";
import { locales } from "@/i18n/request";
import { isServiceSlug, SERVICE_SLUGS } from "@/lib/services";

// eslint-disable-next-line react-refresh/only-export-components
export function generateStaticParams() {
  return locales.flatMap((locale) => SERVICE_SLUGS.map((slug) => ({ locale, slug })));
}

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isServiceSlug(slug)) {
    return {};
  }

  const t = await getTranslations({
    locale,
    namespace: `services.items.${slug}`,
  });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;

  if (!isServiceSlug(slug)) {
    notFound();
  }

  return <ServiceLandingPage slug={slug} />;
}
