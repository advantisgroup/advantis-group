import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ClerkAuthCard } from "@/components/auth/ClerkAuthCard";
import { NO_INDEX } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signUp"), robots: NO_INDEX };
}

export default async function SignUpPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return <ClerkAuthCard title={t("signUpTitle")} subtitle={t("signUpSubtitle")} variant="signUp" />;
}
