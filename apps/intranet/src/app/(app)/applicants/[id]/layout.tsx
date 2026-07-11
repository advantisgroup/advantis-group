"use client";

import { type ReactNode, useEffect, useMemo } from "react";

import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

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
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AmpelPicker, type Ampel } from "@/components/applicants/AmpelBadge";
import { RecentlyViewedApplicants } from "@/components/applicants/RecentlyViewedApplicants";
import { RouteTabs } from "@/components/applicants/RouteTabs";
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
import { buildApplicantSequence } from "@/lib/applicant-list-order";
import { recordRecentlyViewed } from "@/lib/applicant-recent";
import { formatIsoDate } from "@/lib/format";

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
  applicant: NonNullable<ReturnType<typeof useApplicantQuery>>
): string | null {
  switch (tab) {
    case "dokumente":
      return applicant.documents.find(d => d._id === itemId)?.fileName ?? null;
    case "termine":
      return applicant.termine.find(t => t._id === itemId)?.datum ?? null;
    case "kontakte":
      return applicant.kontakte.find(k => k._id === itemId)?.datum ?? null;
    case "emails":
      return applicant.emails.find(e => e._id === itemId)?.datum ?? null;
    case "interviews":
      return applicant.interviews.find(iv => iv._id === itemId)?.datum ?? null;
    default:
      return null;
  }
}

function useApplicantQuery(applicantId: Id<"applicants">) {
  return useQuery(api.applicants.get, { applicantId });
}

export default function ApplicantDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useApplicantQuery(applicantId);
  const update = useMutation(api.applicants.update);
  const remove = useMutation(api.applicants.remove);
  const handleError = useErrorHandler();
  const confirm = useConfirm();

  const segments = pathname.split("/").filter(Boolean); // ["applicants", id, tab?, itemId?]
  const activeTab = segments[2] ?? "uebersicht";
  const itemId = segments[3];

  // Next/previous applicant: only meaningful if we know which list (and
  // filter/sort) the user came from — carried as query params from
  // ApplicantListView. No `from` param ⇒ no buttons, rather than guessing.
  const fromModeRaw = searchParams.get("from");
  const fromMode: "neu" | "pool" | null =
    fromModeRaw === "neu" || fromModeRaw === "pool" ? fromModeRaw : null;
  const fromSearch = searchParams.get("search") ?? "";
  const fromPoolFilter = searchParams.get("poolFilter") as Ampel | null;
  const allApplicants = useQuery(api.applicants.list, fromMode ? {} : "skip");
  const adjacent = useMemo(() => {
    if (!allApplicants || !fromMode) return null;
    const sequence = buildApplicantSequence(
      allApplicants,
      fromMode,
      fromSearch,
      fromPoolFilter
    );
    const index = sequence.findIndex(a => a._id === applicantId);
    if (index === -1) return null;
    return {
      prev: sequence[index - 1] ?? null,
      next: sequence[index + 1] ?? null,
    };
  }, [allApplicants, fromMode, fromSearch, fromPoolFilter, applicantId]);

  function adjacentHref(targetId: Id<"applicants">) {
    const p = new URLSearchParams({ from: fromMode ?? "" });
    if (fromSearch) p.set("search", fromSearch);
    if (fromPoolFilter) p.set("poolFilter", fromPoolFilter);
    return `/applicants/${targetId}/${activeTab}?${p.toString()}`;
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
      confirmText: { target: applicant.name },
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    remove({ applicantId })
      .then(() => {
        toast.success(t("applicantDeleted"));
        router.push("/applicants/termine");
      })
      .catch(handleError);
  }

  if (applicant === undefined) return null;
  if (applicant === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        {t("applicantNotFound")}
      </p>
    );
  }

  const tabs = [
    {
      value: "uebersicht",
      href: `/applicants/${applicantId}/uebersicht`,
      label: t("tabOverview"),
      icon: LayoutDashboard,
    },
    {
      value: "termine",
      href: `/applicants/${applicantId}/termine`,
      label: `${t("tabTermine")} (${applicant.termine.filter(tm => !tm.uebernommen).length})`,
      icon: CalendarClock,
    },
    {
      value: "dokumente",
      href: `/applicants/${applicantId}/dokumente`,
      label: `${t("tabDocuments")} (${applicant.documents.length})`,
      icon: FileText,
    },
    {
      value: "kontakte",
      href: `/applicants/${applicantId}/kontakte`,
      label: `${t("tabKontakte")} (${applicant.kontakte.length})`,
      icon: PhoneCall,
    },
    {
      value: "emails",
      href: `/applicants/${applicantId}/emails`,
      label: `${t("tabEmails")} (${applicant.emails.length})`,
      icon: Mail,
    },
    {
      value: "interviews",
      href: `/applicants/${applicantId}/interviews`,
      label: `${t("tabInterviews")} (${applicant.interviews.length})`,
      icon: Users,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/applicants/termine">
              {t("pageTitle")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {itemId || activeTab !== "uebersicht" ? (
              <BreadcrumbLink href={`/applicants/${applicantId}/uebersicht`}>
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
                  <BreadcrumbLink
                    href={`/applicants/${applicantId}/${activeTab}`}
                  >
                    {t(TAB_LABEL_KEYS[activeTab] ?? "tabOverview")}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>
                    {t(TAB_LABEL_KEYS[activeTab] ?? "tabOverview")}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </>
          )}
          {itemId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {itemLabel ?? formatIsoDate(itemId, locale)}
                </BreadcrumbPage>
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
            onClick={() =>
              window.dispatchEvent(new Event("command-palette:open"))
            }
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
              onClick={() =>
                adjacent.prev && router.push(adjacentHref(adjacent.prev._id))
              }
            >
              <ChevronLeft className="size-4" />
              <span className="hidden md:inline">{t("prevApplicant")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={t("nextApplicant")}
              disabled={!adjacent.next}
              onClick={() =>
                adjacent.next && router.push(adjacentHref(adjacent.next._id))
              }
            >
              <span className="hidden md:inline">{t("nextApplicant")}</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {applicant.name}
              </h1>
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
                    locale
                  ),
                })}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="space-y-1.5 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("ourRating")}
              </p>
              <AmpelPicker
                value={applicant.rating}
                onChange={rating =>
                  update({ applicantId, rating }).catch(handleError)
                }
              />
            </div>
            <Button
              variant="ghost"
              aria-label={t("deleteApplicant")}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
              <span className="hidden md:inline">{t("deleteApplicant")}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <RouteTabs tabs={tabs} activeValue={activeTab} />

      <div className="mt-4">{children}</div>
    </div>
  );
}
