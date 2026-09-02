"use client";

import { useMemo, useState } from "react";

import { Code2, ExternalLink, Globe, Mail, Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LicenseRecord = {
  name: string;
  license: string;
  publisher?: string;
  repository?: string;
  homepage?: string;
  email?: string;
};

/**
 * `licenses.json` keys look like `@alloc/quick-lru@5.2.0`. Split on the last
 * `@` so the version can be set apart from the package name — but not on the
 * leading `@` of a scoped package, which would leave the name headless.
 */
function splitPackageName(key: string): { packageName: string; version?: string } {
  const separator = key.lastIndexOf("@");
  if (separator <= 0) return { packageName: key };
  return { packageName: key.slice(0, separator), version: key.slice(separator + 1) };
}

function npmUrl(packageName: string) {
  return `https://www.npmjs.com/package/${packageName}`;
}

const MAX_LICENSE_FILTERS = 6;

export function LicenseDirectory({ licenses }: { licenses: LicenseRecord[] }) {
  const t = useTranslations("licenses");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<LicenseRecord | null>(null);

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
              "border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
              activeFilter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-rule bg-card text-muted-foreground hover:text-foreground",
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
                "border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
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
              "border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
              activeFilter === "__other__"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-rule bg-card text-muted-foreground hover:text-foreground",
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
        <div className="scroll-panel max-h-[65vh] overflow-y-auto border border-rule">
          {/*
           * `auto-rows-fr` plus `h-full` on the card keeps every tile in a row
           * the same height regardless of how long a package name runs, which
           * is why the name is clamped and the overflow lives in the dialog.
           */}
          <div className="grid auto-rows-fr gap-px bg-rule md:grid-cols-2 xl:grid-cols-3">
            {filteredLicenses.map((record) => {
              const { packageName, version } = splitPackageName(record.name);
              const sourceUrl = record.repository ?? npmUrl(packageName);

              return (
                <article key={record.name} className="flex h-full flex-col bg-background p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                      {record.license}
                    </span>
                  </div>

                  <h2 className="mt-3 text-base font-semibold leading-snug">
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 break-all transition-colors hover:text-primary"
                      title={packageName}
                    >
                      {packageName}
                    </a>
                  </h2>

                  {version ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">{version}</p>
                  ) : null}

                  {record.publisher ? (
                    <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                      {record.publisher}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setDetailsFor(record)}
                    className="mt-auto flex items-center gap-1.5 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
                  >
                    {t("details")}
                    <ExternalLink className="size-3" />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-rule py-16 text-center text-muted-foreground">
          {t("empty")}
        </div>
      )}

      <PackageDetailsDialog record={detailsFor} onClose={() => setDetailsFor(null)} t={t} />
    </div>
  );
}

/**
 * Everything that does not fit on a card: the full package name, the metadata
 * rows, and a button per place the package actually lives — repository, npm,
 * homepage, maintainer.
 */
function PackageDetailsDialog({
  record,
  onClose,
  t,
}: {
  record: LicenseRecord | null;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!record) return null;

  const { packageName, version } = splitPackageName(record.name);
  const links = [
    record.repository
      ? { key: "repository", href: record.repository, label: t("repository"), icon: Code2 }
      : null,
    { key: "npm", href: npmUrl(packageName), label: t("npm"), icon: Package },
    record.homepage
      ? { key: "homepage", href: record.homepage, label: t("homepage"), icon: Globe }
      : null,
    record.email
      ? { key: "email", href: `mailto:${record.email}`, label: record.email, icon: Mail }
      : null,
  ].filter((link) => link !== null);

  const rows = [
    version ? { label: t("version"), value: version } : null,
    { label: t("license"), value: record.license },
    record.publisher ? { label: t("publisher"), value: record.publisher } : null,
  ].filter((row) => row !== null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-none border-rule">
        <DialogHeader>
          <DialogTitle className="break-all text-xl leading-snug">{packageName}</DialogTitle>
          <DialogDescription className="sr-only">{t("details")}</DialogDescription>
        </DialogHeader>

        <dl className="border-t border-rule">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-4 border-b border-rule py-2.5">
              <dt className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 break-words text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-2 grid gap-px bg-rule sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target={link.href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noreferrer"
              className="flex items-center gap-2 bg-background px-4 py-3 text-sm transition-colors hover:bg-card hover:text-primary"
            >
              <link.icon className="size-4 shrink-0" />
              <span className="truncate">{link.label}</span>
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
