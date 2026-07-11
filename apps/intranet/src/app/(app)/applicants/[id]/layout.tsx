"use client";

import { type ReactNode, useMemo } from "react";

import { useParams, usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AmpelPicker } from "@/components/applicants/AmpelBadge";
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

  const itemLabel = useMemo(() => {
    if (!applicant || !itemId) return null;
    return resolveItemLabel(activeTab, itemId, applicant);
  }, [applicant, activeTab, itemId]);

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
    },
    {
      value: "termine",
      href: `/applicants/${applicantId}/termine`,
      label: `${t("tabTermine")} (${applicant.termine.filter(tm => !tm.uebernommen).length})`,
    },
    {
      value: "dokumente",
      href: `/applicants/${applicantId}/dokumente`,
      label: `${t("tabDocuments")} (${applicant.documents.length})`,
    },
    {
      value: "kontakte",
      href: `/applicants/${applicantId}/kontakte`,
      label: `${t("tabKontakte")} (${applicant.kontakte.length})`,
    },
    {
      value: "emails",
      href: `/applicants/${applicantId}/emails`,
      label: `${t("tabEmails")} (${applicant.emails.length})`,
    },
    {
      value: "interviews",
      href: `/applicants/${applicantId}/interviews`,
      label: `${t("tabInterviews")} (${applicant.interviews.length})`,
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
            <p className="mt-1 text-sm text-muted-foreground">
              {applicant.position || t("positionUnknown")} ·{" "}
              {t("receivedOn", {
                date: formatIsoDate(
                  new Date(applicant.createdAt).toISOString().slice(0, 10),
                  locale
                ),
              })}
            </p>
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
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
              {t("deleteApplicant")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <RouteTabs tabs={tabs} activeValue={activeTab} />

      <div className="mt-4">{children}</div>
    </div>
  );
}
