"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, Briefcase, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AmpelDot } from "@/components/applicants/AmpelBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type ArchivedApplicant = FunctionReturnType<typeof api.hr.archive.list>[number];
type Filter = "alle" | "bald" | "pool";

const DAY_MS = 86_400_000;
/** Within this many days of deletion an entry counts as "bald gelöscht". */
const SOON_DAYS = 30;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysLeft = (a: ArchivedApplicant, now: number) =>
  Math.max(0, Math.ceil((a.deletesAt - now) / DAY_MS));
const hasConsent = (a: ArchivedApplicant, now: number) =>
  a.poolConsentUntil !== null && a.poolConsentUntil > now;

/**
 * The Bewerber-Archiv: everyone archived without being hired, newest first,
 * with the day each one is deleted. Restoring puts them back into the
 * recruiting list as they were.
 */
export function ApplicantArchiveView() {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const router = useRouter();
  const archived = useQuery(api.hr.archive.list);
  const restore = useMutation(api.hr.archive.restore);
  const handleError = useErrorHandler();

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("alle");
  const [filter, setFilter] = useState<Filter>("alle");
  // One clock per render pass is enough for "in X Tagen".
  const [now] = useState(() => Date.now());

  const positions = useMemo(
    () =>
      [...new Set((archived ?? []).map((a) => a.position).filter((p): p is string => !!p))].sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [archived],
  );

  const counts = useMemo(() => {
    const all = archived ?? [];
    return {
      total: all.length,
      bald: all.filter((a) => daysLeft(a, now) <= SOON_DAYS).length,
      pool: all.filter((a) => hasConsent(a, now)).length,
    };
  }, [archived, now]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (archived ?? []).filter((a) => {
      if (position !== "alle" && a.position !== position) return false;
      if (filter === "bald" && daysLeft(a, now) > SOON_DAYS) return false;
      if (filter === "pool" && !hasConsent(a, now)) return false;
      if (!q) return true;
      return [a.name, a.email, a.position].some((v) => v?.toLowerCase().includes(q));
    });
  }, [archived, filter, now, position, search]);

  const detailHref = (id: Id<"applicants">) => `/hr/${id}/uebersicht`;

  async function onRestore(a: ArchivedApplicant) {
    try {
      await restore({ applicantId: a._id });
      toast.success(t("archiveRestored", { name: a.name }), {
        action: { label: t("archiveOpenRecord"), onClick: () => router.push(detailHref(a._id)) },
      });
    } catch (error) {
      handleError(error);
    }
  }

  if (archived === undefined) return null;

  const tiles: { value: Filter; label: string; count: number }[] = [
    { value: "alle", label: t("archiveStatTotal"), count: counts.total },
    { value: "bald", label: t("archiveStatSoon", { days: SOON_DAYS }), count: counts.bald },
    { value: "pool", label: t("archiveStatPool"), count: counts.pool },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{t("archiveTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("archiveDescription")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.value}
            type="button"
            onClick={() => setFilter(filter === tile.value ? "alle" : tile.value)}
            className={cn(
              "rounded-lg border border-border/70 bg-card p-3 text-left transition-colors hover:bg-accent/40",
              filter === tile.value && "border-primary bg-primary/5",
            )}
          >
            <p className="font-display text-2xl font-bold tabular-nums">{tile.count}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.label}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md flex-1"
        />
        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("archiveAllPositions")}</SelectItem>
            {positions.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("archiveFilterAll")}</SelectItem>
            <SelectItem value="bald">{t("archiveStatSoon", { days: SOON_DAYS })}</SelectItem>
            <SelectItem value="pool">{t("archiveStatPool")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Archive />}
          title={archived.length === 0 ? t("archiveEmpty") : t("noFilterResults")}
          description={archived.length === 0 ? t("archiveEmptyDescription") : undefined}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("applicant")}</TableHead>
                  <TableHead>{t("position")}</TableHead>
                  <TableHead>{t("received")}</TableHead>
                  <TableHead>{t("archiveArchivedAt")}</TableHead>
                  <TableHead>{t("archiveDeletesAt")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow
                    key={a._id}
                    className="cursor-pointer"
                    onClick={() => router.push(detailHref(a._id))}
                  >
                    <TableCell className="max-w-60">
                      <div className="flex items-center gap-2.5">
                        <AmpelDot rating={a.rating} />
                        <div className="min-w-0">
                          <Link
                            href={detailHref(a._id)}
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
                    <TableCell className="max-w-44">
                      <span className="block truncate text-sm">
                        {a.position || (
                          <span className="text-muted-foreground">{t("positionUnknown")}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatIsoDate(isoDay(a.createdAt), locale)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatIsoDate(isoDay(a.archivedAt), locale)}
                    </TableCell>
                    <TableCell>
                      <DeletesAt applicant={a} now={now} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onRestore(a);
                          }}
                        >
                          <ArchiveRestore className="size-4" />
                          {t("archiveRestore")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 md:hidden">
            {list.map((a) => (
              <div
                key={a._id}
                className="space-y-2 rounded-lg border border-border/70 bg-card p-3.5"
              >
                <Link href={detailHref(a._id)} className="block space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <AmpelDot rating={a.rating} />
                    <p className="min-w-0 flex-1 truncate font-medium">{a.name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Briefcase className="size-3 shrink-0" />
                      <span className="truncate">{a.position || t("positionUnknown")}</span>
                    </span>
                    <DeletesAt applicant={a} now={now} compact />
                  </div>
                </Link>
                <Button variant="outline" size="sm" onClick={() => void onRestore(a)}>
                  <ArchiveRestore className="size-3.5" />
                  {t("archiveRestore")}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DeletesAt({
  applicant,
  now,
  compact,
}: {
  applicant: ArchivedApplicant;
  now: number;
  compact?: boolean;
}) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const left = daysLeft(applicant, now);
  const soon = left <= SOON_DAYS;
  const date = formatIsoDate(isoDay(applicant.deletesAt), locale);
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1", soon && "text-destructive")}>
        <Clock className="size-3 shrink-0" />
        {t("archiveDeletesOn", { date })}
      </span>
    );
  }
  return (
    <div className="text-xs">
      <p className={cn("font-medium", soon ? "text-destructive" : "text-foreground")}>{date}</p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        {t("archiveDaysLeft", { days: left })}
        {hasConsent(applicant, now) && <Badge variant="muted">{t("archiveStatPool")}</Badge>}
      </p>
    </div>
  );
}
