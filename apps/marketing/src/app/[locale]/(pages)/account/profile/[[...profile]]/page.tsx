import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProfilePage } from "@/components/account/ProfilePage";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.nav" });
  return { title: t("profile") };
}

export default function Profile() {
  return <ProfilePage />;
}
