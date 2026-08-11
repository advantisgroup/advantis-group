"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { EmptyState } from "@/components/ui/empty-state";

export default function EmployeeApplicantHistoryPage() {
  const t = useTranslations("Applicants");
  const params = useParams<{ id: string }>();
  const profile = useQuery(api.humanResources.getProfile, {
    employeeProfileId: params.id as Id<"employeeProfiles">,
  });
  if (!profile) return null;
  if (!profile.sourceApplicant) return <EmptyState title={t("employeeNoApplicantHistory")} />;
  return (
    <section className="max-w-2xl space-y-2">
      <h2 className="text-sm font-semibold">{t("employeeApplicantHistory")}</h2>
      <p className="text-sm text-muted-foreground">{t("employeeApplicantHistoryHint")}</p>
      <Link
        className="inline-flex text-sm font-medium text-primary hover:underline"
        href={`/hr/${profile.sourceApplicant._id}/uebersicht`}
      >
        {profile.sourceApplicant.name}
      </Link>
    </section>
  );
}
