"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
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
import { RouteTabs } from "@/components/applicants/RouteTabs";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { filterApplicants, parseRatingFilter, parseStatusFilter } from "@/lib/applicant-list-order";
import { recordRecentlyViewed } from "@/lib/applicant-recent";
import { formatIsoDate, initials } from "@/lib/format";

const TAB_LABEL_KEYS: Record<string, string> = {
  uebersicht: "tabOverview",
  termine: "tabTermine",
  dokumente: "tabDocuments",
  kontakte: "tabKontakte",
  emails: "tabEmails",
  interviews: "tabInterviews",
};

/** Finds the human-readable label for whatever item id sits at the end of
 * the URL (a document filename, a Termin's date, etc.) — for the trailing
 * breadcrumb segment while an item modal is open. */
function resolveItemLabel(
  tab: string,
  itemId: string,
  applicant: NonNullable<ReturnType<typeof useApplicantQuery>>,
): string | null {
  switch (tab) {
    case "dokumente":
      return applicant.documents.find((d) => d._id === itemId)?.fileName ?? null;
    case "termine":
      return applicant.termine.find((t) => t._id === itemId)?.datum ?? null;
    case "kontakte":
      return applicant.kontakte.find((k) => k._id === itemId)?.datum ?? null;
    case "emails":
      return applicant.emails.find((e) => e._id === itemId)?.datum ?? null;
    case "interviews":
      return applicant.interviews.find((iv) => iv._id === itemId)?.datum ?? null;
    default:
      return null;
  }
}

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
  const [quickAdd, setQuickAdd] = useState<"termin" | "kontakt" | "email" | "interview" | null>(
    null,
  );

  const segments = pathname.split("/").filter(Boolean); // ["applicants", id, tab?, itemId?]
  const activeTab = segments[2] ?? "uebersicht";
  const itemId = segments[3];

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

  function adjacentHref(targetId: Id<"applicants">) {
    const p = new URLSearchParams({ from: "list" });
    if (fromStatus !== "alle") p.set("status", fromStatus);
    if (fromRating !== "alle") p.set("rating", fromRating);
    if (fromSearch) p.set("search", fromSearch);
    return `/hr/${targetId}/${activeTab}?${p.toString()}`;
  }

  const itemLabel = useMemo(() => {
    if (!applicant || !itemId) return null;
    return resolveItemLabel(activeTab, itemId, applicant);
  }, [applicant, activeTab, itemId]);

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
      href: `/hr/${applicantId}/termine`,
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
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/hr/list">{t("pageTitle")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {itemId || activeTab !== "uebersicht" ? (
              <BreadcrumbLink href={`/hr/${applicantId}/uebersicht`}>
                {applicant.name}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{applicant.name}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {activeTab && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {itemId ? (
                  <BreadcrumbLink href={`/hr/${applicantId}/${activeTab}`}>
                    {t(TAB_LABEL_KEYS[activeTab] ?? "tabOverview")}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{t(TAB_LABEL_KEYS[activeTab] ?? "tabOverview")}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </>
          )}
          {itemId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{itemLabel ?? formatIsoDate(itemId, locale)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

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

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3.5">
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
          <div className="flex items-center gap-1.5">
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
        <div className="border-t border-border/70 px-2">
          <RouteTabs tabs={tabs} activeValue={activeTab} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{children}</div>
        <ApplicantSidebar applicant={applicant} className="lg:sticky lg:top-20 lg:self-start" />
      </div>

      <HandoffBriefPrint applicant={applicant} />

      <TerminDialog
        open={quickAdd === "termin"}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        fixedApplicantId={applicantId}
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
