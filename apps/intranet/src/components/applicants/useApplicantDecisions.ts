"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

interface DecisionTarget {
  _id: Id<"applicants">;
  name: string;
  position?: string;
  email?: string;
}

/**
 * Hire and archive, with the same confirmations wherever they're offered
 * (the recruiting list and the applicant record). Each resolves to whether
 * it went through, so the caller can move on (e.g. leave the record).
 */
export function useApplicantDecisions() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const convertApplicant = useMutation(api.hr.employees.convertApplicant);
  const revertConversion = useMutation(api.hr.employees.revertConversion);
  const archiveApplicant = useMutation(api.hr.employees.archiveApplicant);

  async function hire(applicant: DecisionTarget): Promise<Id<"employeeProfiles"> | null> {
    // "Hire" reads like "take this one on" — confirm it means the actual hire,
    // not the next step (an appointment is planned inside the record).
    const ok = await confirm({
      title: t("makeEmployeeConfirm", { name: applicant.name }),
      description: t("makeEmployeeConfirmBody"),
      confirmLabel: t("makeEmployee"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return null;
    try {
      const { employeeProfileId } = await convertApplicant({ applicantId: applicant._id });
      // Offering the reversal on the confirmation itself is the moment the
      // user is still looking at what just happened.
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
      return employeeProfileId;
    } catch (error) {
      handleError(error);
      return null;
    }
  }

  async function archive(applicant: DecisionTarget): Promise<boolean> {
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
    if (!ok) return false;
    try {
      await archiveApplicant({ applicantId: applicant._id });
      toast.success(t("applicantArchived"));
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  return { hire, archive };
}
