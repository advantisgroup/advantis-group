import { useTranslations } from "next-intl";

import licensesData from "../../../../../public/licenses.json";

import { Display } from "@/components/frame";
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
    <div className="relative min-h-screen bg-background">
      <main className="relative mx-auto w-full max-w-[1200px] px-5 pb-24 pt-32 md:px-10 md:pt-44">
        <header className="max-w-3xl">
          <Display as="h1" size="lg">
            {t("title")}
          </Display>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("description")}</p>
        </header>

        <div className="mt-14">
          <LicenseDirectory licenses={licenses} />
        </div>
      </main>
    </div>
  );
}
