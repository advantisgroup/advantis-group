"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Mail,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AskButton } from "@/components/ai/AskButton";
import { ApplicantSidebar } from "@/components/applicants/ApplicantSidebar";
import { HandoffBriefPrint } from "@/components/applicants/HandoffBriefPrint";
import {
  EmailDialog,
  InterviewDialog,
  KontaktDialog,
  TerminDialog,
} from "@/components/applicants/EntryDialogs";
import { RecentlyViewedApplicants } from "@/components/applicants/RecentlyViewedApplicants";
import { useApplicantDecisions } from "@/components/applicants/useApplicantDecisions";
import { RouteTabs } from "@/components/layout/RouteTabs";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { filterApplicants, parseRatingFilter, parseStatusFilter } from "@/lib/applicant-list-order";
import { recordRecentlyViewed } from "@/lib/applicant-recent";
import { formatIsoDate, initials } from "@/lib/format";
import { lastVisitWhere } from "@/lib/nav-history";
import { cn } from "@/lib/utils";

function useApplicantQuery(applicantId: Id<"applicants">) {
  return useQuery(api.hr.applicants.get, { applicantId });
}

export default function ApplicantDetailLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useApplicantQuery(applicantId);
  const remove = useMutation(api.hr.applicants.remove);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const decisions = useApplicantDecisions();
  const [quickAdd, setQuickAdd] = useState<"termin" | "kontakt" | "email" | "interview" | null>(
    null,
  );

  const segments = pathname.split("/").filter(Boolean); // ["hr", id, tab?, itemId?]
  const activeTab = segments[2] ?? "uebersicht";

  // Next/previous applicant: only meaningful if we know which filtered list
  // the user came from — carried as query params from the workbench
  // (ApplicantListView). No `from` param ⇒ no buttons, rather than guessing.
  const cameFromList = searchParams.get("from") === "list";
  const fromStatus = parseStatusFilter(searchParams.get("status"));
  const fromRating = parseRatingFilter(searchParams.get("rating"));
  const fromSearch = searchParams.get("search") ?? "";
  const allApplicants = useQuery(api.hr.applicants.list, cameFromList ? {} : "skip");
  const adjacent = useMemo(() => {
    if (!allApplicants || !cameFromList) return null;
    const sequence = filterApplicants(allApplicants, {
      status: fromStatus,
      rating: fromRating,
      search: fromSearch,
    });
    const index = sequence.findIndex((a) => a._id === applicantId);
    if (index === -1) return null;
    return {
      prev: sequence[index - 1] ?? null,
      next: sequence[index + 1] ?? null,
    };
  }, [allApplicants, cameFromList, fromStatus, fromRating, fromSearch, applicantId]);

  // Back to the recruiting list with the filters the user came from.
  const backHref = useMemo(() => {
    const p = new URLSearchParams();
    for (const key of ["status", "rating", "health", "search"]) {
      const value = searchParams.get(key);
      if (value) p.set(key, value);
    }
    const query = p.toString();
    return query ? `/hr/list?${query}` : "/hr/list";
  }, [searchParams]);

  // Back to wherever the user came from (list, calendar, another Akte);
  // the filtered list when there is nothing before this Akte.
  function goBack() {
    const previous = lastVisitWhere((url) => url.split("?")[0].split("/")[2] !== applicantId);
    if (!previous || previous.split("?")[0].endsWith("/list")) router.push(backHref);
    else router.push(previous);
  }

  // The Akte's tab strip sticks under the header; once it does, it shows
  // the name so you still know whose Akte you are in.
  const stripSentinel = useRef<HTMLDivElement>(null);
  const [stripStuck, setStripStuck] = useState(false);
  const loaded = !!applicant;
  useEffect(() => {
    const el = stripSentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStripStuck(!entry.isIntersecting && entry.boundingClientRect.top < 80),
      { rootMargin: "-65px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loaded]);

  async function handleHire() {
    if (!applicant) return;
    const employeeProfileId = await decisions.hire({
      _id: applicantId,
      name: applicant.name,
      position: applicant.position ?? undefined,
      email: applicant.email ?? undefined,
    });
    if (employeeProfileId) router.push(`/hr/employees/${employeeProfileId}`);
  }

  async function handleArchive() {
    if (!applicant) return;
    const done = await decisions.archive({
      _id: applicantId,
      name: applicant.name,
      position: applicant.position ?? undefined,
      email: applicant.email ?? undefined,
    });
    if (done) router.push(backHref);
  }

  function adjacentHref(targetId: Id<"applicants">) {
    const p = new URLSearchParams({ from: "list" });
    if (fromStatus !== "alle") p.set("status", fromStatus);
    if (fromRating !== "alle") p.set("rating", fromRating);
    if (fromSearch) p.set("search", fromSearch);
    return `/hr/${targetId}/${activeTab}?${p.toString()}`;
  }

  useEffect(() => {
    if (applicant) recordRecentlyViewed(applicantId, applicant.name);
  }, [applicant, applicantId]);

  async function handleDelete() {
    if (!applicant) return;
    const ok = await confirm({
      title: t("deleteApplicant"),
      description: t("deleteApplicantConfirm", { name: applicant.name }),
      details: [{ label: tc("fieldName"), value: applicant.name }],
      confirmText: { target: applicant.name },
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    remove({ applicantId })
      .then(() => {
        toast.success(t("applicantDeleted"));
        router.push("/hr/list");
      })
      .catch(handleError);
  }

  if (applicant === undefined) return null;
  if (applicant === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">{t("applicantNotFound")}</p>
    );
  }

  const tabs = [
    {
      value: "uebersicht",
      href: `/hr/${applicantId}/uebersicht`,
      label: t("tabOverview"),
      icon: LayoutDashboard,
    },
    {
      value: "termine",
      // The shared calendar, with this applicant outlined.
      href: `/hr/termine?von=${applicantId}`,
      label: t("tabTermine"),
      icon: CalendarClock,
      count: applicant.termine.filter((tm) => !tm.uebernommen).length,
    },
    {
      value: "dokumente",
      href: `/hr/${applicantId}/dokumente`,
      label: t("tabDocuments"),
      icon: FileText,
      count: applicant.documents.length,
    },
    {
      value: "kontakte",
      href: `/hr/${applicantId}/kontakte`,
      label: t("tabKontakte"),
      icon: PhoneCall,
      count: applicant.kontakte.length,
    },
    {
      value: "emails",
      href: `/hr/${applicantId}/emails`,
      label: t("tabEmails"),
      icon: Mail,
      count: applicant.emails.length,
    },
    {
      value: "interviews",
      href: `/hr/${applicantId}/interviews`,
      label: t("tabInterviews"),
      icon: Users,
      count: applicant.interviews.length,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("switchApplicant")}
            onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
          >
            <Search className="size-4" />
            <span className="hidden md:inline">{t("switchApplicant")}</span>
          </Button>
          <RecentlyViewedApplicants excludeId={applicantId} />
        </div>
        {adjacent && (adjacent.prev || adjacent.next) && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label={t("prevApplicant")}
              disabled={!adjacent.prev}
              onClick={() => adjacent.prev && router.push(adjacentHref(adjacent.prev._id))}
            >
              <ChevronLeft className="size-4" />
              <span className="hidden md:inline">{t("prevApplicant")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={t("nextApplicant")}
              disabled={!adjacent.next}
              onClick={() => adjacent.next && router.push(adjacentHref(adjacent.next._id))}
            >
              <span className="hidden md:inline">{t("nextApplicant")}</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden md:rounded-b-none">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3.5">
            <Button
              variant="outline"
              size="icon"
              className="mt-1.5 size-9 shrink-0 rounded-full"
              aria-label={tc("back")}
              title={tc("back")}
              onClick={goBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Avatar className="size-12 border-border/70">
              <AvatarFallback className="font-display text-base font-semibold">
                {initials(applicant.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{applicant.name}</h1>
                <Badge variant={applicant.status === "neu" ? "default" : "muted"}>
                  {applicant.status === "neu" ? t("statusNeu") : t("statusPool")}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-3.5" />
                  {applicant.position || t("positionUnknown")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {t("receivedOn", {
                    date: formatIsoDate(
                      new Date(applicant.createdAt).toISOString().slice(0, 10),
                      locale,
                    ),
                  })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Archived or hired records are done: no second decision. */}
            {!applicant.archivedAt && (
              <>
                <Button variant="outline" onClick={() => void handleHire()}>
                  <UserCheck className="size-4" />
                  <span className="hidden md:inline">{t("makeEmployee")}</span>
                </Button>
                <Button variant="outline" onClick={() => void handleArchive()}>
                  <Archive className="size-4" />
                  <span className="hidden md:inline">{t("archiveApplicant")}</span>
                </Button>
              </>
            )}
            <AskButton subject={{ type: "applicant", id: applicantId, label: applicant.name }} />
            <ActionMenu
              ariaLabel={t("addEntry")}
              trigger={
                <Button aria-label={t("addEntry")}>
                  <Plus className="size-4" />
                  <span className="hidden md:inline">{t("addEntry")}</span>
                </Button>
              }
              items={[
                {
                  key: "termin",
                  label: t("planTermin"),
                  icon: <CalendarClock className="size-4" />,
                  onSelect: () => setQuickAdd("termin"),
                },
                {
                  key: "kontakt",
                  label: t("logContact"),
                  icon: <PhoneCall className="size-4" />,
                  onSelect: () => setQuickAdd("kontakt"),
                },
                {
                  key: "email",
                  label: t("logEmail"),
                  icon: <Mail className="size-4" />,
                  onSelect: () => setQuickAdd("email"),
                },
                {
                  key: "interview",
                  label: t("logInterview"),
                  icon: <Users className="size-4" />,
                  onSelect: () => setQuickAdd("interview"),
                },
              ]}
            />
            <Button
              variant="ghost"
              aria-label={t("deleteApplicant")}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The Akte's own sub-pages, attached to its card and apart from the
          HR tabs up in the header. Sticks under the header while scrolling. */}
      <div ref={stripSentinel} aria-hidden className="!mt-0 h-0" />
      <nav
        aria-label={applicant.name}
        className={cn(
          "sticky top-0 z-20 !mt-0 hidden rounded-b-[var(--radius)] border border-t-0 border-border/70 bg-muted/60 px-2 py-1.5 backdrop-blur-xl transition-shadow md:block",
          stripStuck && "rounded-[var(--radius)] border-t bg-background/90 shadow-md",
        )}
      >
        <RouteTabs
          tabs={tabs}
          activeValue={activeTab}
          inline
          variant="segmented"
          leading={
            stripStuck ? (
              <span className="mr-1 flex shrink-0 items-center gap-1.5 border-r border-border/70 pr-3">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label={tc("back")}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <span className="max-w-48 truncate text-sm font-semibold">{applicant.name}</span>
              </span>
            ) : undefined
          }
        />
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{children}</div>
        <ApplicantSidebar applicant={applicant} className="lg:sticky lg:top-20 lg:self-start" />
      </div>

      <HandoffBriefPrint applicant={applicant} />

      <TerminDialog
        open={quickAdd === "termin"}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        fixedApplicantId={applicantId}
        applicantName={applicant.name}
      />
      <KontaktDialog
        open={quickAdd === "kontakt"}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        applicantId={applicantId}
        showFirstContactHint={applicant.status === "neu"}
      />
      <EmailDialog
        open={quickAdd === "email"}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        applicantId={applicantId}
      />
      <InterviewDialog
        open={quickAdd === "interview"}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        applicantId={applicantId}
      />
    </div>
  );
}
