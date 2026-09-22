"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { LayoutGrid, List, Mail, Pause, Play, Search, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandIcon, NpmMark } from "@/components/licenses/BrandMarks";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { faviconUrl, gitHubOwner, packageIconUrl, repositoryHostLabel } from "@/lib/licenses";
import { cn } from "@/lib/utils";

type LicenseRecord = {
  name: string;
  license: string;
  publisher?: string;
  repository?: string;
  homepage?: string;
  email?: string;
};

type View = "gallery" | "plain";

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

function groupLetter(packageName: string) {
  const first = packageName.replace(/^@/, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

// Plain-words summaries only exist for the common ones; anything else just
// shows its SPDX name.
const SUMMARY_KEYS: Record<string, string> = {
  MIT: "mit",
  ISC: "isc",
  "Apache-2.0": "apache",
  "BSD-2-Clause": "bsd2",
  "BSD-3-Clause": "bsd3",
  "MPL-2.0": "mpl",
  "MIT-0": "noNotice",
  "0BSD": "noNotice",
  Unlicense: "noNotice",
};

const MAX_LICENSE_FILTERS = 6;
const OTHER = "__other__";

// Darkest for the biggest share, fading out from there.
const SEGMENT_TONES = [
  "bg-foreground/75",
  "bg-foreground/50",
  "bg-foreground/38",
  "bg-foreground/28",
  "bg-foreground/20",
  "bg-foreground/14",
  "bg-foreground/10",
];

const MAX_THANKS_AVATARS = 12;

const SCROLL_SPEED = 22; // px per second
const RESUME_AFTER_MS = 4000;
const HOLD_AT_ENDS_MS = 2500;

// A mask rather than overlay divs on purpose: overlays sit on top of the list
// and swallow the clicks and swipes meant for it.
const FADE_EDGES = {
  maskImage:
    "linear-gradient(to bottom, transparent, #000 56px, #000 calc(100% - 56px), transparent)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent, #000 56px, #000 calc(100% - 56px), transparent)",
};

/**
 * Drifts a real scroll container downwards like closing credits, so the
 * reader's own scrolling always works on top of it: any wheel, touch, key or
 * hover hands control back, and the drift picks up from wherever they left
 * it a few seconds later. Holds at the bottom, glides back to the top and
 * starts over. Off entirely under reduced motion.
 *
 * `readerHolding` says whether the reader is what's stopping it right now, so
 * the pause button can show what's actually happening.
 */
function useAutoScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [readerHolding, setReaderHolding] = useState(false);
  const resumeRef = useRef(() => {});

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || reducedMotion) return;

    let hovering = false;
    let focused = false;
    let visible = true;
    let heldByReaderUntil = 0;
    let reported = false;
    // A short beat at the top before it starts moving, but not when resuming mid-list.
    let holdUntil = element.scrollTop === 0 ? performance.now() + HOLD_AT_ENDS_MS : 0;
    let returnToTop = false;
    let position = element.scrollTop;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;

      const holding = hovering || focused || now < heldByReaderUntil;
      if (holding !== reported) {
        reported = holding;
        setReaderHolding(holding);
      }

      if (!holding && visible && !document.hidden && now >= holdUntil) {
        if (returnToTop) {
          returnToTop = false;
          element.scrollTo({ top: 0, behavior: "smooth" });
          holdUntil = now + HOLD_AT_ENDS_MS;
        } else {
          // Someone (or a smooth scroll) moved it since the last frame — carry on from there.
          if (Math.abs(element.scrollTop - position) > 2) position = element.scrollTop;

          const end = element.scrollHeight - element.clientHeight;
          if (position >= end - 1) {
            returnToTop = true;
            holdUntil = now + HOLD_AT_ENDS_MS;
          } else {
            position = Math.min(end, position + (SCROLL_SPEED * elapsed) / 1000);
            element.scrollTop = position;
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    const handBack = () => {
      returnToTop = false;
      heldByReaderUntil = performance.now() + RESUME_AFTER_MS;
    };
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") hovering = true;
    };
    const onPointerLeave = () => {
      hovering = false;
      handBack();
    };
    const onFocusIn = () => (focused = true);
    const onFocusOut = () => {
      focused = false;
      handBack();
    };
    resumeRef.current = () => {
      heldByReaderUntil = 0;
      holdUntil = 0;
    };

    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(element);

    element.addEventListener("wheel", handBack, { passive: true });
    element.addEventListener("touchstart", handBack, { passive: true });
    element.addEventListener("touchend", handBack, { passive: true });
    element.addEventListener("pointerdown", handBack);
    element.addEventListener("keydown", handBack);
    element.addEventListener("pointerenter", onPointerEnter);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("focusin", onFocusIn);
    element.addEventListener("focusout", onFocusOut);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("wheel", handBack);
      element.removeEventListener("touchstart", handBack);
      element.removeEventListener("touchend", handBack);
      element.removeEventListener("pointerdown", handBack);
      element.removeEventListener("keydown", handBack);
      element.removeEventListener("pointerenter", onPointerEnter);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("focusin", onFocusIn);
      element.removeEventListener("focusout", onFocusOut);
      resumeRef.current = () => {};
      setReaderHolding(false);
    };
  }, [ref, enabled, reducedMotion]);

  return { canDrift: !reducedMotion, readerHolding, resume: () => resumeRef.current() };
}

export function LicenseDirectory({ licenses }: { licenses: LicenseRecord[] }) {
  const t = useTranslations("licenses");
  const [view, setView] = useState<View>("gallery");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [hoveredFilter, setHoveredFilter] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<LicenseRecord | null>(null);
  const [shuffled, setShuffled] = useState(false);
  const [drifting, setDrifting] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const licenseMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { license } of licenses) {
      counts.set(license, (counts.get(license) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const top = sorted
      .slice(0, MAX_LICENSE_FILTERS)
      .map(([license, count]) => ({ key: license, label: license, count }));
    const otherCount = sorted
      .slice(MAX_LICENSE_FILTERS)
      .reduce((total, [, count]) => total + count, 0);
    return otherCount > 0
      ? [...top, { key: OTHER, label: t("filterOther"), count: otherCount }]
      : top;
  }, [licenses, t]);

  const topLicenseNames = useMemo(
    () => new Set(licenseMix.filter(({ key }) => key !== OTHER).map(({ key }) => key)),
    [licenseMix],
  );

  const maintainers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { repository } of licenses) {
      const owner = gitHubOwner(repository);
      if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([owner]) => owner);
  }, [licenses]);

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
      if (activeFilter === OTHER) return !topLicenseNames.has(license);
      return license === activeFilter;
    });
  }, [licenses, query, activeFilter, topLicenseNames]);

  const groups = useMemo(() => {
    const byLetter = new Map<string, LicenseRecord[]>();
    for (const record of filteredLicenses) {
      const letter = groupLetter(splitPackageName(record.name).packageName);
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), record]);
    }
    return [...byLetter.entries()];
  }, [filteredLicenses]);

  // The scroller unmounts on an empty search, so its count is part of the
  // switch — otherwise the drift wouldn't restart once results come back.
  const drift = useAutoScroll(
    scrollerRef,
    view === "gallery" && drifting && !detailsFor && filteredLicenses.length > 0,
  );
  const moving = drifting && !drift.readerHolding;

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [query, activeFilter]);

  const surprise = () => {
    const pool = filteredLicenses.length > 0 ? filteredLicenses : licenses;
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && next === detailsFor) {
      next = pool[(pool.indexOf(next) + 1) % pool.length];
    }
    setShuffled(true);
    setDetailsFor(next);
  };

  const openDetails = (record: LicenseRecord) => {
    setShuffled(false);
    setDetailsFor(record);
  };

  const highlighted = hoveredFilter ?? activeFilter;
  const activeSummaryKey = activeFilter ? SUMMARY_KEYS[activeFilter] : undefined;

  return (
    <div>
      <section aria-label={t("filterLabel")} className="max-w-3xl">
        <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {licenseMix.map(({ key, count }, i) => (
            <div
              key={key}
              style={{ flexGrow: count }}
              className={cn(
                "min-w-[3px] basis-0 transition-colors duration-200",
                highlighted === key ? "bg-advantis" : SEGMENT_TONES[i],
                highlighted && highlighted !== key && "opacity-60",
              )}
            />
          ))}
        </div>

        <div role="group" className="-mx-2 mt-4 flex flex-wrap gap-1">
          {licenseMix.map(({ key, label, count }, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter((current) => (current === key ? null : key))}
              // Mouse only, so a tap on a phone doesn't leave a segment lit.
              onPointerEnter={(event) => event.pointerType === "mouse" && setHoveredFilter(key)}
              onPointerLeave={() => setHoveredFilter(null)}
              aria-pressed={activeFilter === key}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[13px] transition-colors md:min-h-8",
                activeFilter === key
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full transition-colors",
                  highlighted === key ? "bg-advantis" : SEGMENT_TONES[i],
                )}
              />
              {label}
              <span className="tabular-nums text-muted-foreground/70">{count}</span>
            </button>
          ))}
        </div>

        <p className="mt-3 min-h-[1.5rem] text-[15px] leading-relaxed text-muted-foreground">
          {activeFilter && activeFilter !== OTHER ? (
            <>
              <span className="font-medium text-foreground">{activeFilter}</span>
              {activeSummaryKey ? <> — {t(`summaries.${activeSummaryKey}`)}</> : null}
            </>
          ) : (
            t("mixHint")
          )}
        </p>
      </section>

      <div className="mt-10 flex flex-col gap-3 sm:sticky sm:top-20 sm:z-10 sm:-mx-4 sm:flex-row sm:items-center sm:bg-background/85 sm:px-4 sm:py-3 sm:backdrop-blur-md">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="h-11 pl-11"
          />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={surprise} className="h-11 flex-1 sm:flex-none">
            <Shuffle />
            {t("surprise")}
          </Button>
          <div
            role="group"
            aria-label={t("viewLabel")}
            className="flex h-11 shrink-0 rounded-lg border border-rule-strong p-1"
          >
            {(
              [
                { value: "gallery", label: t("viewGallery"), Icon: LayoutGrid },
                { value: "plain", label: t("viewPlain"), Icon: List },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  view === value
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {t("resultCount", { count: filteredLicenses.length })}
        </p>
        {view === "gallery" && drift.canDrift && filteredLicenses.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (moving) {
                setDrifting(false);
              } else {
                setDrifting(true);
                drift.resume();
              }
            }}
            className="flex min-h-11 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
          >
            {moving ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {moving ? t("pauseScroll") : t("resumeScroll")}
          </button>
        ) : null}
      </div>

      {filteredLicenses.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-dashed border-rule py-16 text-center text-muted-foreground">
          {t("empty")}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setActiveFilter(null);
            }}
          >
            {t("clearSearch")}
          </Button>
        </div>
      ) : view === "gallery" ? (
        <div
          ref={scrollerRef}
          style={FADE_EDGES}
          // Lenis owns the page's wheel events, so without this the wheel
          // scrolls the page instead of the list. Wheel only — plain
          // `data-lenis-prevent` also turns on overscroll containment, which
          // would stop a phone swipe from carrying on to the page at the ends.
          data-lenis-prevent-wheel
          // Kept well short of the viewport so there's always page left to
          // swipe on around it — a full-height inner scroller is what trapped
          // phones on the first version of this page.
          className="mt-2 h-[min(640px,62svh)] overflow-y-auto overscroll-y-auto py-14"
        >
          {groups.map(([letter, records]) => (
            <section key={letter} aria-label={letter} className="mb-10 last:mb-0">
              <div aria-hidden className="mb-3 flex items-center gap-4 px-1">
                <span className="font-display text-3xl leading-none text-foreground/80">
                  {letter}
                </span>
                <span className="h-px flex-1 bg-rule" />
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {records.map((record) => (
                  <li key={record.name}>
                    <PackageTile record={record} onOpen={() => openDetails(record)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <PlainTable records={filteredLicenses} onOpen={openDetails} />
      )}

      {maintainers.length > 0 ? (
        <section className="mt-24 flex flex-col gap-6 border-t border-rule pt-10 md:flex-row md:items-center md:gap-10">
          <div className="group flex shrink-0 items-center">
            {maintainers.slice(0, MAX_THANKS_AVATARS).map((owner, i) => (
              <span
                key={owner}
                title={owner}
                className="-ml-2 first:ml-0"
                style={{ transitionDelay: `${i * 35}ms` }}
              >
                <BrandIcon
                  src={packageIconUrl(`https://github.com/${owner}`)}
                  alt=""
                  className="size-9 rounded-full border-0 ring-2 ring-background grayscale transition-[filter] duration-300 group-hover:grayscale-0 [transition-delay:inherit]"
                />
              </span>
            ))}
            {maintainers.length > MAX_THANKS_AVATARS ? (
              <span className="-ml-2 flex size-9 items-center justify-center rounded-full bg-accent text-[12px] font-medium tabular-nums text-muted-foreground ring-2 ring-background">
                +{maintainers.length - MAX_THANKS_AVATARS}
              </span>
            ) : null}
          </div>
          <p className="max-w-xl font-display text-xl leading-snug text-balance">
            {t("thanks", { count: maintainers.length })}
          </p>
        </section>
      ) : null}

      <PackageDetailsDialog
        record={detailsFor}
        onClose={() => setDetailsFor(null)}
        onShuffle={shuffled ? surprise : undefined}
      />
    </div>
  );
}

function PackageName({ packageName }: { packageName: string }) {
  const scopeEnd = packageName.startsWith("@") ? packageName.indexOf("/") + 1 : 0;
  return (
    <>
      {scopeEnd > 0 ? (
        <span className="text-muted-foreground">{packageName.slice(0, scopeEnd)}</span>
      ) : null}
      {packageName.slice(scopeEnd)}
    </>
  );
}

function PackageTile({ record, onOpen }: { record: LicenseRecord; onOpen: () => void }) {
  const { packageName, version } = splitPackageName(record.name);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col rounded-xl border border-transparent p-4 text-left transition-colors hover:border-rule hover:bg-card focus-visible:border-rule focus-visible:bg-card focus-visible:outline-none"
    >
      <div className="flex items-center justify-between gap-3">
        <BrandIcon src={packageIconUrl(record.repository)} alt="" className="size-9 rounded-lg" />
        <span className="truncate rounded-full border border-rule px-2 py-0.5 text-[12px] text-muted-foreground">
          {record.license}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 break-words font-display text-lg leading-snug">
        <PackageName packageName={packageName} />
      </p>
      <p className="mt-1 truncate text-[13px] text-muted-foreground">
        {[record.publisher, version].filter(Boolean).join(" · ")}
      </p>
    </button>
  );
}

/**
 * The version for checking what's in use rather than browsing: every
 * package on the page itself, no images, no motion, no inner scroll.
 */
function PlainTable({
  records,
  onOpen,
}: {
  records: LicenseRecord[];
  onOpen: (record: LicenseRecord) => void;
}) {
  const t = useTranslations("licenses");

  return (
    <table className="mt-2 w-full border-t border-rule text-left text-sm">
      <thead>
        <tr className="border-b border-rule text-[13px] text-muted-foreground">
          <th className="py-2.5 pr-4 font-medium">{t("package")}</th>
          <th className="hidden py-2.5 pr-4 font-medium sm:table-cell">{t("version")}</th>
          <th className="py-2.5 pr-4 font-medium">{t("license")}</th>
          <th className="hidden py-2.5 font-medium md:table-cell">{t("publisher")}</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record) => {
          const { packageName, version } = splitPackageName(record.name);
          return (
            <tr key={record.name} className="border-b border-rule align-baseline">
              <td className="py-2.5 pr-4">
                <button
                  type="button"
                  onClick={() => onOpen(record)}
                  className="break-all text-left underline decoration-rule-strong underline-offset-4 transition-colors hover:decoration-foreground"
                >
                  {packageName}
                </button>
              </td>
              <td className="hidden py-2.5 pr-4 tabular-nums text-muted-foreground sm:table-cell">
                {version}
              </td>
              <td className="py-2.5 pr-4">{record.license}</td>
              <td className="hidden py-2.5 text-muted-foreground md:table-cell">
                {record.publisher}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Everything the tile leaves out: the full package name, the metadata rows,
 * what the license means in plain words, and a link per place the package
 * actually lives — repository, npm, homepage, maintainer.
 */
function PackageDetailsDialog({
  record,
  onClose,
  onShuffle,
}: {
  record: LicenseRecord | null;
  onClose: () => void;
  onShuffle?: () => void;
}) {
  const t = useTranslations("licenses");
  if (!record) return null;

  const { packageName, version } = splitPackageName(record.name);
  const hostLabel = repositoryHostLabel(record.repository);
  const summaryKey = SUMMARY_KEYS[record.license];

  const links = [
    record.repository
      ? {
          key: "repository",
          href: record.repository,
          // "GitHub" says more than "Open repository" when we know the host.
          label: hostLabel ?? t("repository"),
          mark: <BrandIcon src={packageIconUrl(record.repository)} alt="" className="size-4" />,
        }
      : null,
    {
      key: "npm",
      href: npmUrl(packageName),
      label: t("npm"),
      mark: <NpmMark className="size-4" />,
    },
    record.homepage
      ? {
          key: "homepage",
          href: record.homepage,
          label: t("homepage"),
          mark: (
            <BrandIcon
              src={faviconUrl(record.homepage)}
              alt=""
              fallback="globe"
              className="size-4 border-0"
            />
          ),
        }
      : null,
    record.email
      ? {
          key: "email",
          href: `mailto:${record.email}`,
          label: record.email,
          mark: <Mail className="size-4 shrink-0" />,
        }
      : null,
  ].filter((link) => link !== null);

  const rows = [
    version ? { label: t("version"), value: version } : null,
    {
      label: t("license"),
      value: (
        <>
          {record.license}
          {summaryKey ? (
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {t(`summaries.${summaryKey}`)}
            </span>
          ) : null}
        </>
      ),
    },
    record.publisher ? { label: t("publisher"), value: record.publisher } : null,
  ].filter((row) => row !== null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-xl border-rule">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BrandIcon
              src={packageIconUrl(record.repository)}
              alt=""
              className="size-10 rounded-lg"
            />
            <DialogTitle className="break-all text-xl leading-snug">{packageName}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">{t("details")}</DialogDescription>
        </DialogHeader>

        <dl className="border-t border-rule">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-4 border-b border-rule py-2.5">
              <dt className="w-28 shrink-0 text-[13px] font-medium text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 break-words text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-2 grid gap-px overflow-hidden rounded-lg bg-rule sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target={link.href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noreferrer"
              className="flex items-center gap-2 bg-background px-4 py-3 text-sm transition-colors hover:bg-card hover:text-primary"
            >
              {link.mark}
              <span className="truncate">{link.label}</span>
            </a>
          ))}
        </div>

        {onShuffle ? (
          <Button variant="ghost" size="sm" onClick={onShuffle} className="justify-self-start">
            <Shuffle />
            {t("another")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
