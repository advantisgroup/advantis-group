"use client";

import { useMemo, useState } from "react";

import { ExternalLink, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

type LicenseRecord = {
  name: string;
  license: string;
  publisher?: string;
  repository?: string;
};

export function LicenseDirectory({ licenses }: { licenses: LicenseRecord[] }) {
  const t = useTranslations("licenses");
  const [query, setQuery] = useState("");
  const filteredLicenses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return licenses;

    return licenses.filter(({ name, license, publisher }) =>
      [name, license, publisher].some((value) =>
        value?.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [licenses, query]);

  return (
    <div className="space-y-8">
      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="h-12 pl-12"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {t("resultCount", { count: filteredLicenses.length })}
      </p>

      {filteredLicenses.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLicenses.map(({ name, license, publisher, repository }) => (
            <article key={name} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <h2 className="break-all font-semibold leading-snug">{name}</h2>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {license}
                </span>
              </div>
              {publisher && <p className="mt-3 text-sm text-muted-foreground">{publisher}</p>}
              {repository && (
                <a
                  href={repository}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  {t("repository")}
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          {t("empty")}
        </div>
      )}
    </div>
  );
}
