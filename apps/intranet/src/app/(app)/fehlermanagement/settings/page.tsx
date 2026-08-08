"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";

function ThresholdField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24"
      />
    </div>
  );
}

export default function ErrorManagementSettingsPage() {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const categories = useQuery(api.errorCategories.list) ?? [];
  const createCategory = useMutation(api.errorCategories.create);
  const renameCategory = useMutation(api.errorCategories.rename);
  const removeCategory = useMutation(api.errorCategories.remove);
  const [newCategory, setNewCategory] = useState("");

  const settings = useQuery(api.errorSettings.get);
  const updateSettings = useMutation(api.errorSettings.update);
  const [targetResponseDays, setTargetResponseDays] = useState(3);
  const [warnResponseDays, setWarnResponseDays] = useState(7);
  const [defaultDueDays, setDefaultDueDays] = useState(14);
  const [defaultMeasureDueDays, setDefaultMeasureDueDays] = useState(7);

  useEffect(() => {
    if (!settings) return;
    setTargetResponseDays(settings.targetResponseDays);
    setWarnResponseDays(settings.warnResponseDays);
    setDefaultDueDays(settings.defaultDueDays);
    setDefaultMeasureDueDays(settings.defaultMeasureDueDays);
  }, [settings]);

  if (!isManager) {
    return <p className="py-20 text-center text-sm text-muted-foreground">{t("managerOnly")}</p>;
  }

  async function onAddCategory() {
    const name = newCategory.trim();
    if (!name) return;
    try {
      await createCategory({ name });
      setNewCategory("");
    } catch (e) {
      handleError(e);
    }
  }

  async function onDeleteCategory(
    categoryId: Parameters<typeof removeCategory>[0]["categoryId"],
    name: string,
  ) {
    const ok = await confirm({
      title: t("deleteCategoryConfirm"),
      details: [{ label: tc("fieldName"), value: name }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeCategory({ categoryId });
    } catch (e) {
      handleError(e);
    }
  }

  async function onSaveThresholds() {
    try {
      await updateSettings({
        targetResponseDays,
        warnResponseDays,
        defaultDueDays,
        defaultMeasureDueDays,
      });
      toast.success(t("settingsSaved"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-tour="tour-fehlermanagement-settings">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("categoriesTitle")}
          </p>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c._id} className="flex items-center gap-2">
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== c.name) {
                      renameCategory({ categoryId: c._id, name: value }).catch(handleError);
                    }
                  }}
                  className="h-8"
                />
                <button
                  type="button"
                  onClick={() => void onDeleteCategory(c._id, c.name)}
                  aria-label={tc("delete")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t("categoryNamePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && void onAddCategory()}
              className="h-8"
            />
            <Button size="sm" onClick={() => void onAddCategory()}>
              <Plus className="mr-1 size-3.5" />
              {t("addCategory")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("thresholdsTitle")}
          </p>
          <div className="divide-y divide-border/60">
            <ThresholdField
              label={t("targetResponseDays")}
              value={targetResponseDays}
              onChange={setTargetResponseDays}
            />
            <ThresholdField
              label={t("warnResponseDays")}
              value={warnResponseDays}
              onChange={setWarnResponseDays}
            />
            <ThresholdField
              label={t("defaultDueDays")}
              value={defaultDueDays}
              onChange={setDefaultDueDays}
            />
            <ThresholdField
              label={t("defaultMeasureDueDays")}
              value={defaultMeasureDueDays}
              onChange={setDefaultMeasureDueDays}
            />
          </div>
          <Button className="mt-3" size="sm" onClick={() => void onSaveThresholds()}>
            {tc("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
