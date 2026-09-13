"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { MEASURE_PHASES, dateInputToMs, type MeasurePhase } from "@/lib/error-management";

const EMPTY_REPORTS: NonNullable<ReturnType<typeof useQuery<typeof api.errorReports.list>>> = [];

export function NewMeasureDialog({
  open,
  onOpenChange,
  defaultErrorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultErrorId: string | null;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const reports = useQuery(api.errorReports.list) ?? EMPTY_REPORTS;
  const users = useQuery(api.users.list, {}) ?? [];
  const create = useMutation(api.errorMeasures.create);

  const [errorId, setErrorId] = useState(defaultErrorId ?? "");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<MeasurePhase>("d3_sofort");
  const [ownerUserId, setOwnerUserId] = useState("unassigned");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setErrorId(defaultErrorId ?? reports[0]?._id ?? "");
  }, [open, defaultErrorId, reports]);

  async function onSubmit() {
    if (!description.trim() || !errorId) return;
    setBusy(true);
    try {
      await create({
        errorReportId: errorId as Id<"errorReports">,
        description,
        phase,
        ownerUserId: ownerUserId === "unassigned" ? undefined : (ownerUserId as Id<"users">),
        dueAt: dateInputToMs(dueDate),
      });
      toast.success(t("created"));
      setDescription("");
      setOwnerUserId("unassigned");
      setDueDate("");
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("newMeasure")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={busy || !description.trim() || !errorId}
          >
            {tc("create")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("fieldLinkedError")}
          </label>
          <Select value={errorId} onValueChange={setErrorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reports.map((r) => (
                <SelectItem key={r._id} value={r._id}>
                  {r.description.slice(0, 60)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("fieldMeasureDescription")}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("fieldMeasureDescriptionPlaceholder")}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldPhase")}
            </label>
            <Select value={phase} onValueChange={(v) => setPhase(v as MeasurePhase)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEASURE_PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`phase.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldOwner")}
            </label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">{t("ownerUnassigned")}</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("fieldDueAt")}
          </label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
