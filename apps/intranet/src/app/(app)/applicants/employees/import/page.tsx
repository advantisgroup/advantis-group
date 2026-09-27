"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CheckCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { PersonList } from "@/components/people/PersonPicker";
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
import { EmptyState } from "@/components/ui/empty-state";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** Backfills HR records for people who were in the intranet before HR was. */
export default function EmployeeImportPage() {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const handleError = useErrorHandler();
  const candidates = useQuery(api.hr.employees.backfillCandidates, {});
  const backfill = useMutation(api.hr.employees.backfillFromIntranet);
  const [selected, setSelected] = useState<ReadonlySet<Id<"users">>>(new Set());
  const [busy, setBusy] = useState(false);

  const matchOf = new Map(candidates?.map((person) => [person.userId, person.matchedEmployee]));
  const anyMatch = candidates?.some((person) => person.matchedEmployee) ?? false;
  const allSelected = !!candidates?.length && selected.size === candidates.length;

  function toggle(userId: Id<"users">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function run() {
    setBusy(true);
    try {
      const result = await backfill({ userIds: [...selected] });
      toast.success(t("employeeImportDone", result));
      router.push("/hr/employees");
    } catch (error) {
      handleError(error);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
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
            <BreadcrumbPage>{t("employeeImport")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="font-display text-2xl font-bold">{t("employeeImportTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("employeeImportDescription")}</p>
      </div>

      {candidates === undefined ? null : candidates.length === 0 ? (
        <EmptyState
          icon={<CheckCheck />}
          title={t("employeeImportEmpty")}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/hr/employees">{t("tabEmployees")}</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(candidates.map((person) => person.userId)),
                  )
                }
              >
                {allSelected ? t("employeeImportSelectNone") : t("employeeImportSelectAll")}
              </Button>
              <Button
                className="ml-auto max-sm:w-full"
                disabled={busy || selected.size === 0}
                onClick={() => void run()}
              >
                <UserPlus className="size-4" />
                {t("employeeImportConfirm", { count: selected.size })}
              </Button>
            </div>
            <PersonList
              multiple
              people={candidates}
              selected={selected}
              onSelect={(person) => toggle(person.userId)}
              hint={(person) => {
                const match = matchOf.get(person.userId);
                return match ? t("employeeImportMatches", { name: match.name }) : null;
              }}
              listClassName="max-h-[60dvh]"
            />
            {anyMatch && (
              <p className="text-xs text-muted-foreground">{t("employeeImportMatchesHint")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
