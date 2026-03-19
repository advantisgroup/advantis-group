import { getTranslations } from "next-intl/server";

import { ClerkAuthCard } from "@/components/auth/ClerkAuthCard";

export default async function SignUpPage() {
  const t = await getTranslations("auth");

  return (
    <ClerkAuthCard
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      variant="signUp"
    />
  );
}
