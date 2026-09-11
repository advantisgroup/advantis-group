"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  BookmarkPlus,
  Briefcase,
  CalendarClock,
  FileText,
  UserCheck,
  UserRoundSearch,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AmpelDot, type Ampel } from "@/components/applicants/AmpelBadge";
import { today } from "@/components/applicants/applicant-types";
import { CvImportTray } from "@/components/applicants/CvImportTray";
import { UploadCvButton } from "@/components/applicants/UploadCvButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
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
import {
  matchesApplicantPipelineHealth,
  type ApplicantPipelineHealth,
} from "@/lib/applicant-pipeline-health";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useErrorHandler } from "@/hooks/use-error-handler";

import type { FunctionReturnType } from "convex/server";

type Applicant = FunctionReturnType<typeof api.applicants.list>[number];
type SkillProfile = FunctionReturnType<typeof api.applicants.listProfiles>[number];

const RATING_OPTIONS: (Ampel | "offen")[] = ["gruen", "blau", "rot", "offen"];
type HealthFilter = "alle" | ApplicantPipelineHealth;
type SavedApplicantView = {
  id: string;
  name: string;
  status: StatusFilter;
  rating: RatingFilter;
  health: HealthFilter;
};

function parseHealthFilter(value: string | null): HealthFilter {
  return value === "uncontacted" || value === "overdue" || value === "stale" ? value : "alle";
}

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
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const applicants = useQuery(api.applicants.list);
  const preferences = useQuery(api.userPreferences.getMine);
  const profiles = useQuery(api.applicants.listProfiles);
  const convertApplicant = useMutation(api.humanResources.convertApplicant);
  const revertConversion = useMutation(api.humanResources.revertConversion);
  const archiveApplicant = useMutation(api.humanResources.archiveApplicant);
  const setPreferences = useMutation(api.userPreferences.setMine);

  const status = parseStatusFilter(searchParams.get("status"));
  const rating = parseRatingFilter(searchParams.get("rating"));
  const health = parseHealthFilter(searchParams.get("health"));
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const savedApplicantViews = preferences?.savedApplicantViews ?? [];

  function setParams(next: {
    status?: StatusFilter;
    rating?: RatingFilter;
    health?: HealthFilter;
    q?: string;
  }) {
    const p = new URLSearchParams(searchParams.toString());
    const apply = (key: string, value: string | undefined, none: string) => {
      if (value === undefined) return;
      if (value === none) p.delete(key);
      else p.set(key, value);
    };
    apply("status", next.status, "alle");
    apply("rating", next.rating, "alle");
    apply("health", next.health, "alle");
    apply("q", next.q?.trim(), "");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function applySavedView(savedView: SavedApplicantView) {
    setSearch("");
    setParams({ ...savedView, q: "" });
  }

  async function saveApplicantView() {
    const name = viewName.trim();
    if (!name) return;
    await setPreferences({
      savedApplicantViews: [
        ...savedApplicantViews,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          status,
          rating,
          health,
        },
      ].slice(-8),
    });
    setViewName("");
    setSaveViewOpen(false);
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

  const list = useMemo(() => {
    const filtered = filterApplicants(applicants ?? [], { status, rating, search });
    return health === "alle"
      ? filtered
      : filtered.filter((applicant) => matchesApplicantPipelineHealth(applicant, health));
  }, [applicants, health, rating, search, status]);

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
    if (health !== "alle") p.set("health", health);
    if (search.trim()) p.set("search", search.trim());
    return `/hr/${a._id}/uebersicht?${p.toString()}`;
  }

  async function onConvert(applicant: Applicant) {
    try {
      await convertApplicant({ applicantId: applicant._id });
      // Hire sits right next to Archive, so a misclick is easy. Offering the
      // reversal on the confirmation itself is the only moment the user is
      // still looking at what just happened.
      toast.success(t("applicantConverted"), {
        duration: 12_000,
        action: {
          label: t("undoHire"),
          onClick: () => {
            void revertConversion({ applicantId: applicant._id })
              .then(() => toast.success(t("undoHireDone", { name: applicant.name })))
              .catch(() => toast.error(t("undoHireBlocked")));
          },
        },
      });
    } catch (error) {
      handleError(error);
    }
  }

  async function onArchive(applicant: Applicant) {
    const ok = await confirm({
      title: t("archiveApplicantConfirm", { name: applicant.name }),
      details: [
        ...(applicant.position ? [{ label: t("position"), value: applicant.position }] : []),
        ...(applicant.email ? [{ label: t("email"), value: applicant.email }] : []),
      ],
      confirmLabel: t("archiveApplicant"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await archiveApplicant({ applicantId: applicant._id });
      toast.success(t("applicantArchived"));
    } catch (error) {
      handleError(error);
    }
  }

  if (applicants === undefined) return null;

  if (applicants.length === 0) {
    return (
      <div className="space-y-4">
        <CvImportTray />
        <EmptyState
          icon={<UserRoundSearch />}
          title={t("listEmpty")}
          description={t("listEmptyDescription")}
          action={<UploadCvButton />}
        />
      </div>
    );
  }

  const profileFor = (a: Applicant) => (a.profilId ? (profileById.get(a.profilId) ?? null) : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("recruitingTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("recruitingDescription")}</p>
        </div>
        <UploadCvButton />
      </div>

      <CvImportTray />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label={t("statTotal")}
          value={counts.total}
          active={status === "alle" && rating === "alle" && health === "alle"}
          onClick={() => setParams({ status: "alle", rating: "alle", health: "alle" })}
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
        <Select value={health} onValueChange={(v) => setParams({ health: v as HealthFilter })}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("healthAll")}</SelectItem>
            <SelectItem value="uncontacted">{t("healthUncontacted")}</SelectItem>
            <SelectItem value="overdue">{t("healthOverdue")}</SelectItem>
            <SelectItem value="stale">{t("healthStale")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5"
          onClick={() => setSaveViewOpen(true)}
        >
          <BookmarkPlus className="size-4" />
          {t("saveView")}
        </Button>
      </div>

      {savedApplicantViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t("savedViews")}>
          <span className="mr-1 text-xs font-medium text-muted-foreground">{t("savedViews")}</span>
          {savedApplicantViews.map((savedView) => (
            <div
              key={savedView.id}
              className="flex items-center overflow-hidden rounded-full border border-border bg-card text-xs"
            >
              <button
                type="button"
                className="px-3 py-1 font-medium hover:bg-accent"
                onClick={() => applySavedView(savedView)}
              >
                {savedView.name}
              </button>
              <button
                type="button"
                className="grid size-6 place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t("removeSavedView", { name: savedView.name })}
                onClick={() =>
                  void setPreferences({
                    savedApplicantViews: savedApplicantViews.filter(
                      (view) => view.id !== savedView.id,
                    ),
                  })
                }
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

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
                  <TableHead className="text-right">{t("actions")}</TableHead>
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
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("makeEmployee")}
                          title={t("makeEmployee")}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onConvert(a);
                          }}
                        >
                          <UserCheck className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("archiveApplicant")}
                          title={t("archiveApplicant")}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onArchive(a);
                          }}
                        >
                          <Archive className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: compact cards with the same key facts. */}
          <div className="grid gap-2 md:hidden">
            {list.map((a) => (
              <div
                key={a._id}
                className="space-y-2 rounded-lg border border-border/70 bg-card p-3.5 transition-colors hover:bg-accent/40"
              >
                <Link href={detailHref(a)} className="block space-y-1.5">
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
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => void onConvert(a)}>
                    <UserCheck className="size-3.5" />
                    {t("makeEmployee")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onArchive(a)}>
                    <Archive className="size-3.5" />
                    {t("archiveApplicant")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveViewTitle")}</DialogTitle>
            <DialogDescription>{t("saveViewDescription")}</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="applicant-view-name" className="mb-2 block text-sm font-medium">
              {t("viewName")}
            </label>
            <Input
              id="applicant-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder={t("viewNamePlaceholder")}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button disabled={!viewName.trim()} onClick={() => void saveApplicantView()}>
              {t("saveView")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
