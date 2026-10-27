"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

const NOBODY = "__none";

/** "Kunde anlegen": a customer entered by hand. Admins pick who works it;
 * everyone else gets it themselves. */
export function CreateCaseDialog({
  open,
  onOpenChange,
  canManage,
  assignees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  assignees: { userId: Id<"users">; name: string }[] | undefined;
  onCreated: (id: Id<"onboardingCases">) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const create = useMutation(api.performance.onboarding.create);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [assignee, setAssignee] = useState(NOBODY);
  const [accountStatus, setAccountStatus] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [note, setNote] = useState("");
  const [prio, setPrio] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setNumber("");
    setName("");
    setAssignee(NOBODY);
    setAccountStatus("");
    setCloseDate("");
    setNote("");
    setPrio(false);
  };

  const submit = async () => {
    if (!number.trim() || !name.trim()) {
      toast.error(t("create.required"));
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        customerNumber: number,
        name,
        assigneeUserId: canManage && assignee !== NOBODY ? (assignee as Id<"users">) : undefined,
        accountStatus: accountStatus || undefined,
        closeDate: closeDate || undefined,
        note: note || undefined,
        prio,
      });
      toast.success(t("create.created"));
      reset();
      onOpenChange(false);
      onCreated(id);
    } catch (e) {
      handleError(e, t("create.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.intro")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-new-number">{t("create.number")}</Label>
            <Input
              id="ob-new-number"
              value={number}
              inputMode="numeric"
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-new-name">{t("create.name")}</Label>
            <Input id="ob-new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-new-account">{t("create.accountStatus")}</Label>
            <Input
              id="ob-new-account"
              value={accountStatus}
              placeholder="Active"
              onChange={(e) => setAccountStatus(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-new-close">{t("create.closeDate")}</Label>
            <Input
              id="ob-new-close"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>
          {canManage && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("create.assignee")}</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>{t("case.nobody")}</SelectItem>
                  {(assignees ?? []).map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-new-note">{t("create.note")}</Label>
            <Textarea
              id="ob-new-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch id="ob-new-prio" checked={prio} onCheckedChange={setPrio} />
            <Label htmlFor="ob-new-prio">{t("create.prio")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("create.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t("create.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
