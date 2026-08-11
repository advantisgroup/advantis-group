"use client";

import { useMemo, useState } from "react";

import { ExternalLink, Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LicenseRecord = {
  name: string;
  license: string;
  publisher?: string;
  repository?: string;
};

const MAX_LICENSE_FILTERS = 6;

export function LicenseDirectory({ licenses }: { licenses: LicenseRecord[] }) {
  const t = useTranslations("licenses");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const licenseFilters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { license } of licenses) {
      counts.set(license, (counts.get(license) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_LICENSE_FILTERS)
      .map(([license, count]) => ({ license, count }));
  }, [licenses]);

  const topLicenseNames = useMemo(
    () => new Set(licenseFilters.map((filter) => filter.license)),
    [licenseFilters],
  );

  const filteredLicenses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return licenses.filter(({ name, license, publisher }) => {
      const matchesQuery =
        !normalizedQuery ||
        [name, license, publisher].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedQuery),
        );
      if (!matchesQuery) return false;

      if (!activeFilter) return true;
      if (activeFilter === "__other__") return !topLicenseNames.has(license);
      return license === activeFilter;
    });
  }, [licenses, query, activeFilter, topLicenseNames]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:sticky sm:top-20 sm:z-10 sm:-mx-4 sm:bg-background/80 sm:px-4 sm:py-3 sm:backdrop-blur-md">
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

        <div
          role="group"
          aria-label={t("filterLabel")}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            aria-pressed={activeFilter === null}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeFilter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t("filterAll")} ({licenses.length})
          </button>
          {licenseFilters.map(({ license, count }) => (
            <button
              key={license}
              type="button"
              onClick={() => setActiveFilter((current) => (current === license ? null : license))}
              aria-pressed={activeFilter === license}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                activeFilter === license
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {license} ({count})
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setActiveFilter((current) => (current === "__other__" ? null : "__other__"))
            }
            aria-pressed={activeFilter === "__other__"}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeFilter === "__other__"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t("filterOther")}
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("resultCount", { count: filteredLicenses.length })}
        </p>
      </div>

      {filteredLicenses.length > 0 ? (
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 rounded-t-2xl bg-gradient-to-b from-background to-transparent" />
          <div className="scroll-panel max-h-[65vh] overflow-y-auto rounded-2xl border border-border bg-card/40 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredLicenses.map(({ name, license, publisher, repository }) => (
                <article
                  key={name}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="flex items-start gap-2 break-all font-semibold leading-snug">
                      <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{name}</span>
                    </h2>
                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {license}
                    </span>
                  </div>
                  {publisher && (
                    <p className="mt-3 truncate text-sm text-muted-foreground">{publisher}</p>
                  )}
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
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 rounded-b-2xl bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          {t("empty")}
        </div>
      )}
    </div>
  );
}
