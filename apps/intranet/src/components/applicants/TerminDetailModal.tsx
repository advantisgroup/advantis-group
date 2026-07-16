"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { CopyLinkButton } from "@/components/applicants/CopyLinkButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export function TerminDetailModal({
  applicantId,
  termin,
}: {
  applicantId: Id<"applicants">;
  termin: ApplicantDetail["termine"][number];
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const confirm = useConfirm();
  const convertTermin = useMutation(api.applicants.convertTermin);
  const removeTermin = useMutation(api.applicants.removeTermin);
  const handleError = useErrorHandler();

  function close() {
    router.back();
  }

  function handleConvert() {
    convertTermin({ terminId: termin._id })
      .then(() => {
        toast.success(t("terminConverted"));
        close();
      })
      .catch(handleError);
  }

  async function handleRemove() {
    const ok = await confirm({
      title: t("deleteTermin"),
      description: t("deleteTerminConfirm"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeTermin({ terminId: termin._id }).then(close).catch(handleError);
  }

  return (
    <Dialog open onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pt-6 pr-12">
          <DialogTitle>{t(`terminTyp.${termin.typ}`)}</DialogTitle>
          <DialogDescription className="mt-1">
            {formatIsoDate(termin.datum, "de-DE")} · {termin.uhrzeit} ·{" "}
            {t(`terminArt.${termin.art}`)}
          </DialogDescription>
        </div>
        <div className="space-y-3 px-6 py-5">
          {termin.notiz && <p className="text-sm">{termin.notiz}</p>}
          {termin.uebernommen && (
            <p className="text-xs font-medium text-success">
              {t("terminConverted")}
            </p>
          )}
          <CopyLinkButton
            href={`/applicants/${applicantId}/termine/${termin._id}`}
            className="-ml-3"
          />
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          {!termin.uebernommen && (
            <Button variant="outline" onClick={handleConvert}>
              {t("markAsHappened")}
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleRemove()}
          >
            {tc("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
