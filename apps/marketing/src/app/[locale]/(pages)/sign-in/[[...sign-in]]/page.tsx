import { getTranslations } from "next-intl/server";

import { ClerkAuthCard } from "@/components/auth/ClerkAuthCard";

export default async function SignInPage() {
  const t = await getTranslations("auth");

  return <ClerkAuthCard title={t("signInTitle")} subtitle={t("signInSubtitle")} variant="signIn" />;
}
