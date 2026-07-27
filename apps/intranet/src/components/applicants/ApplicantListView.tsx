"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { matchSkills } from "@advantis/types";
import { useQuery } from "convex/react";
import { Briefcase, CalendarClock, FileText, UserRoundSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AmpelDot, type Ampel } from "@/components/applicants/AmpelBadge";
import { today } from "@/components/applicants/applicant-types";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  filterApplicants,
  parseRatingFilter,
  parseStatusFilter,
  type RatingFilter,
  type StatusFilter,
} from "@/lib/applicant-list-order";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];
type SkillProfile = FunctionReturnType<typeof api.applicants.listProfiles>[number];

const RATING_OPTIONS: (Ampel | "offen")[] = ["gruen", "blau", "rot", "offen"];

function StatTile({
  label,
  value,
  active,
  onClick,
  dot,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  dot?: Ampel | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border/70 bg-card p-3 text-left transition-colors hover:bg-accent/40",
        active && "border-primary bg-primary/5",
      )}
    >
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot !== undefined && <AmpelDot rating={dot} className="size-2" />}
        {label}
      </p>
    </button>
  );
}

function MatchChip({ applicant, profile }: { applicant: Applicant; profile: SkillProfile | null }) {
  if (!profile) {
    return <span className="text-muted-foreground">–</span>;
  }
  const matched = matchSkills(profile.skills, applicant);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        matched.length > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      <span className="truncate font-medium">{profile.name}</span>
      <span className="shrink-0 tabular-nums">
        {matched.length}/{profile.skills.length}
      </span>
    </span>
  );
}

function NextTerminCell({ applicant }: { applicant: Applicant }) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const termin = applicant.nextOpenTermin;
  if (!termin) return <span className="text-muted-foreground">–</span>;
  const overdue = termin.datum < today();
  return (
    <div className="text-xs">
      <p className={cn("font-medium", overdue ? "text-destructive" : "text-foreground")}>
        {formatIsoDate(termin.datum, locale)}
        {termin.uhrzeit ? ` · ${termin.uhrzeit}` : ""}
      </p>
      <p className={overdue ? "text-destructive" : "text-muted-foreground"}>
        {t(`terminTyp.${termin.typ}`)}
        {overdue ? ` · ${t("overdue")}` : ""}
      </p>
    </div>
  );
}

/**
 * The applicant workbench — one dense, filterable overview of every Akte
 * instead of the former "Neue Bewerber" / "Bewerberpool" split. Filters live
 * in the URL (`status`, `rating`, `q`) so the state survives navigating into
 * a file and back, and the detail page's next/previous stepper can rebuild
 * the exact same sequence from the same params.
 */
export function ApplicantListView() {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const applicants = useQuery(api.applicants.list);
  const profiles = useQuery(api.applicants.listProfiles);

  const status = parseStatusFilter(searchParams.get("status"));
  const rating = parseRatingFilter(searchParams.get("rating"));
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function setParams(next: { status?: StatusFilter; rating?: RatingFilter; q?: string }) {
    const p = new URLSearchParams(searchParams.toString());
    const apply = (key: string, value: string | undefined, none: string) => {
      if (value === undefined) return;
      if (value === none) p.delete(key);
      else p.set(key, value);
    };
    apply("status", next.status, "alle");
    apply("rating", next.rating, "alle");
    apply("q", next.q?.trim(), "");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  // Debounced: typing filters the table immediately (local state); the URL
  // follows shortly after so back-navigation restores the search.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((searchParams.get("q") ?? "") !== search.trim()) {
        setParams({ q: search });
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p._id, p])), [profiles]);

  const list = useMemo(
    () => filterApplicants(applicants ?? [], { status, rating, search }),
    [applicants, status, rating, search],
  );

  const counts = useMemo(() => {
    const all = applicants ?? [];
    return {
      total: all.length,
      neu: all.filter((a) => a.status === "neu").length,
      pool: all.filter((a) => a.status === "pool").length,
      offen: all.filter((a) => !a.rating).length,
    };
  }, [applicants]);

  function detailHref(a: Applicant) {
    const p = new URLSearchParams({ from: "list" });
    if (status !== "alle") p.set("status", status);
    if (rating !== "alle") p.set("rating", rating);
    if (search.trim()) p.set("search", search.trim());
    return `/applicants/${a._id}/uebersicht?${p.toString()}`;
  }

  if (applicants === undefined) return null;

  if (applicants.length === 0) {
    return (
      <EmptyState
        icon={<UserRoundSearch />}
        title={t("listEmpty")}
        description={t("listEmptyDescription")}
      />
    );
  }

  const profileFor = (a: Applicant) => (a.profilId ? (profileById.get(a.profilId) ?? null) : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label={t("statTotal")}
          value={counts.total}
          active={status === "alle" && rating === "alle"}
          onClick={() => setParams({ status: "alle", rating: "alle" })}
        />
        <StatTile
          label={t("filterNeu")}
          value={counts.neu}
          active={status === "neu"}
          onClick={() => setParams({ status: status === "neu" ? "alle" : "neu" })}
        />
        <StatTile
          label={t("filterPool")}
          value={counts.pool}
          active={status === "pool"}
          onClick={() => setParams({ status: status === "pool" ? "alle" : "pool" })}
        />
        <StatTile
          label={t("ampel.offen")}
          value={counts.offen}
          active={rating === "offen"}
          onClick={() => setParams({ rating: rating === "offen" ? "alle" : "offen" })}
          dot={null}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md flex-1"
        />
        <Select value={rating} onValueChange={(v) => setParams({ rating: v as RatingFilter })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("allRatings")}</SelectItem>
            {RATING_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                <span className="inline-flex items-center gap-2">
                  <AmpelDot rating={r === "offen" ? null : r} />
                  {t(`ampel.${r}`)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<UserRoundSearch />}
          title={search.trim() ? t("noResults", { query: search.trim() }) : t("noFilterResults")}
        />
      ) : (
        <>
          {/* Desktop: the dense table. */}
          <div className="hidden overflow-hidden rounded-lg border border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("applicant")}</TableHead>
                  <TableHead>{t("position")}</TableHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                  <TableHead>{t("skillMatch")}</TableHead>
                  <TableHead className="text-center">{t("tabDocuments")}</TableHead>
                  <TableHead>{t("nextTermin")}</TableHead>
                  <TableHead>{t("lastActivity")}</TableHead>
                  <TableHead>{t("received")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow
                    key={a._id}
                    className="cursor-pointer"
                    onClick={() => router.push(detailHref(a))}
                  >
                    <TableCell className="max-w-56">
                      <div className="flex items-center gap-2.5">
                        <AmpelDot rating={a.rating} />
                        <div className="min-w-0">
                          <Link
                            href={detailHref(a)}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium hover:underline"
                          >
                            {a.name}
                          </Link>
                          {a.email && (
                            <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-40">
                      <span className="block truncate text-sm">
                        {a.position || (
                          <span className="text-muted-foreground">{t("positionUnknown")}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.status === "neu" ? "default" : "muted"}>
                        {a.status === "neu" ? t("filterNeu") : t("filterPool")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-40">
                      <MatchChip applicant={a} profile={profileFor(a)} />
                    </TableCell>
                    <TableCell className="text-center">
                      {a.documentsCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm tabular-nums">
                          <FileText className="size-3.5 text-muted-foreground" />
                          {a.documentsCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <NextTerminCell applicant={a} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.lastActivity ? formatIsoDate(a.lastActivity, locale) : "–"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatIsoDate(new Date(a.createdAt).toISOString().slice(0, 10), locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: compact cards with the same key facts. */}
          <div className="grid gap-2 md:hidden">
            {list.map((a) => (
              <Link
                key={a._id}
                href={detailHref(a)}
                className="space-y-1.5 rounded-lg border border-border/70 bg-card p-3.5 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-center gap-2.5">
                  <AmpelDot rating={a.rating} />
                  <p className="min-w-0 flex-1 truncate font-medium">{a.name}</p>
                  <Badge variant={a.status === "neu" ? "default" : "muted"}>
                    {a.status === "neu" ? t("filterNeu") : t("filterPool")}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Briefcase className="size-3 shrink-0" />
                    <span className="truncate">{a.position || t("positionUnknown")}</span>
                  </span>
                  {a.documentsCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="size-3 shrink-0" />
                      {a.documentsCount}
                    </span>
                  )}
                  {a.nextOpenTermin && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        a.nextOpenTermin.datum < today() && "text-destructive",
                      )}
                    >
                      <CalendarClock className="size-3 shrink-0" />
                      {formatIsoDate(a.nextOpenTermin.datum, locale)}
                      {a.nextOpenTermin.uhrzeit ? ` · ${a.nextOpenTermin.uhrzeit}` : ""}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
