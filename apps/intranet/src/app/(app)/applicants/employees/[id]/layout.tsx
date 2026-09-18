"use client";

import type { ReactNode } from "react";

import { useParams, usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { Briefcase, Building2, FileText, History, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
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
import { Card, CardContent } from "@/components/ui/card";
import { initials } from "@/lib/format";

const TAB_LABEL_KEYS: Record<string, string> = {
  overview: "employeeOverview",
  documents: "employeeDocuments",
  applicant: "employeeApplicantHistory",
};

export default function EmployeeDetailLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Applicants");
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const employeeProfileId = params.id as Id<"employeeProfiles">;
  const profile = useQuery(api.hr.employees.getProfile, { employeeProfileId });
  const tail = pathname.split("/").filter(Boolean).at(-1);
  const active = tail === String(employeeProfileId) ? "overview" : (tail ?? "overview");
  const base = `/hr/employees/${employeeProfileId}`;

  if (profile === undefined) return null;
  if (profile === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">{t("employeeNotFound")}</p>
    );
  }

  const tabs = [
    {
      value: "overview",
      href: base,
      label: t("employeeOverview"),
      icon: LayoutDashboard,
    },
    {
      value: "documents",
      href: `${base}/documents`,
      label: t("employeeDocuments"),
      icon: FileText,
    },
    {
      value: "applicant",
      href: `${base}/applicant`,
      label: t("employeeApplicantHistory"),
      icon: History,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/hr/employees">{t("pageTitle")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/hr/employees">{t("tabEmployees")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {active === "overview" ? (
              <BreadcrumbPage>{profile.name}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink href={base}>{profile.name}</BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {active !== "overview" && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t(TAB_LABEL_KEYS[active] ?? "employeeOverview")}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar className="size-12 border-border/70">
              <AvatarFallback className="font-display text-base font-semibold">
                {initials(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-2xl font-bold">{profile.name}</h1>
                <Badge variant={profile.status === "active" ? "success" : "muted"}>
                  {t(`employeeStatus.${profile.status}`)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-3.5" />
                  {profile.jobTitle || t("positionUnknown")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {profile.department || t("employeeNoDepartment")}
                </span>
              </div>
            </div>
          </div>
          <Badge variant={profile.userId ? "success" : "outline"}>
            {profile.linkedProfile?.name || t("employeeNoAccount")}
          </Badge>
        </CardContent>
        <div className="border-t border-border/70 px-2">
          <RouteTabs tabs={tabs} activeValue={active} />
        </div>
      </Card>

      {children}
    </div>
  );
}
