"use client";

import { useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

export default function EmployeeApplicantHistoryPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const revertConversion = useMutation(api.hr.employees.revertConversion);
  const [busy, setBusy] = useState(false);
  const profile = useQuery(api.hr.employees.getProfile, {
    employeeProfileId: params.id as Id<"employeeProfiles">,
  });
  if (!profile) return null;
  if (!profile.sourceApplicant) return <EmptyState title={t("employeeNoApplicantHistory")} />;
  const applicant = profile.sourceApplicant;

  // Hired by mistake (or too early): only while the record is still the empty
  // shell the hire created — the server refuses once documents are attached.
  async function undo() {
    const ok = await confirm({
      title: t("undoHireConfirm", { name: applicant.name }),
      description: t("undoHireBody"),
      confirmLabel: t("undoHire"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revertConversion({ applicantId: applicant._id });
      toast.success(t("undoHireDone", { name: applicant.name }));
      router.push(`/hr/${applicant._id}/uebersicht`);
    } catch {
      toast.error(t("undoHireBlocked"));
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-3">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("employeeApplicantHistory")}</h2>
        <p className="text-sm text-muted-foreground">{t("employeeApplicantHistoryHint")}</p>
        <Link
          className="inline-flex text-sm font-medium text-primary hover:underline"
          href={`/hr/${applicant._id}/uebersicht`}
        >
          {applicant.name}
        </Link>
      </div>
      <div className="space-y-1.5 border-t pt-3">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void undo()}>
          <Undo2 className="size-4" />
          {t("undoHire")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("undoHireHint")}</p>
      </div>
    </section>
  );
}
