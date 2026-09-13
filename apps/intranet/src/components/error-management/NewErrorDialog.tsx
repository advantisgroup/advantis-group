"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { SEVERITIES, type Severity } from "@/lib/error-management";

export function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("ErrorManagement");
  const categories = useQuery(api.errorCategories.list) ?? [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("fieldCategoryNone")}</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c._id} value={c._id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NewErrorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const create = useMutation(api.errorReports.create);

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [severity, setSeverity] = useState<Severity>("niedrig");
  const [customer, setCustomer] = useState("");
  const [responsible, setResponsible] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setDescription("");
    setCategoryId("none");
    setSeverity("niedrig");
    setCustomer("");
    setResponsible("");
  }

  async function onSubmit() {
    if (!description.trim()) return;
    setBusy(true);
    try {
      await create({
        description,
        categoryId: categoryId === "none" ? undefined : (categoryId as Id<"errorCategories">),
        severity,
        customerOrProject: customer || undefined,
        responsibleName: responsible || undefined,
      });
      toast.success(t("created"));
      reset();
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newErrorTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fieldDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("fieldDescriptionPlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCategory")}
              </label>
              <CategorySelect value={categoryId} onChange={setCategoryId} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldSeverity")}
              </label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`severity.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldCustomer")}
              </label>
              <Input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder={t("fieldCustomerPlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("fieldResponsible")}
              </label>
              <Input
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder={t("fieldResponsiblePlaceholder")}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy || !description.trim()}>
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
