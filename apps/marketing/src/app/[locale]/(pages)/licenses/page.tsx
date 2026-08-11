import { useTranslations } from "next-intl";

import licensesData from "../../../../../public/licenses.json";

import { LicenseDirectory } from "@/components/licenses/LicenseDirectory";

export default function LicensesPage() {
  const t = useTranslations("licenses");
  const licenses = Object.entries(
    licensesData as Record<string, { licenses: string; publisher?: string; repository?: string }>,
  )
    .map(([name, details]) => ({
      name,
      license: details.licenses,
      publisher: details.publisher,
      repository: details.repository,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <main className="container mx-auto px-4 pb-24 pt-24">
      <section className="mx-auto max-w-7xl space-y-12">
        <header className="mx-auto max-w-3xl space-y-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold md:text-6xl">{t("title")}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{t("description")}</p>
        </header>
        <LicenseDirectory licenses={licenses} />
      </section>
    </main>
  );
}
