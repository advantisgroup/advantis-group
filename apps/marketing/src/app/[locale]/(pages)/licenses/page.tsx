import { useTranslations } from "next-intl";

import licensesData from "../../../../../public/licenses.json";

import { LegalLayout } from "@/components/legal/LegalLayout";
import { LicenseDirectory } from "@/components/licenses/LicenseDirectory";

export default function LicensesPage() {
  const t = useTranslations("licenses");
  const licenses = Object.entries(
    licensesData as Record<
      string,
      { licenses: string; publisher?: string; repository?: string; url?: string; email?: string }
    >,
  )
    .map(([name, details]) => ({
      name,
      license: details.licenses,
      publisher: details.publisher,
      repository: details.repository,
      homepage: details.url,
      email: details.email,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <LegalLayout title={t("title")} description={t("description")}>
      <LicenseDirectory licenses={licenses} />
    </LegalLayout>
  );
}
