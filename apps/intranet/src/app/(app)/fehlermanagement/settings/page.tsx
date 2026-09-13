"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";

const quietInput =
  "h-8 border-transparent bg-transparent shadow-none hover:border-border focus-visible:border-border";

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

  const thresholds = [
    ["targetResponseDays", targetResponseDays, setTargetResponseDays],
    ["warnResponseDays", warnResponseDays, setWarnResponseDays],
    ["defaultDueDays", defaultDueDays, setDefaultDueDays],
    ["defaultMeasureDueDays", defaultMeasureDueDays, setDefaultMeasureDueDays],
  ] as const;
  const thresholdsChanged =
    !!settings &&
    (targetResponseDays !== settings.targetResponseDays ||
      warnResponseDays !== settings.warnResponseDays ||
      defaultDueDays !== settings.defaultDueDays ||
      defaultMeasureDueDays !== settings.defaultMeasureDueDays);

  return (
    <div className="space-y-8" data-tour="tour-fehlermanagement-settings">
      <SettingsSection title={t("categoriesTitle")}>
        {categories.map((c) => (
          <div key={c._id} className="flex items-center gap-2 px-2 py-1.5">
            <Input
              defaultValue={c.name}
              aria-label={tc("fieldName")}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== c.name) {
                  renameCategory({ categoryId: c._id, name: value }).catch(handleError);
                }
              }}
              className={quietInput}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tc("delete")}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void onDeleteCategory(c._id, c.name)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={t("categoryNamePlaceholder")}
            onKeyDown={(e) => e.key === "Enter" && void onAddCategory()}
            className={quietInput}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!newCategory.trim()}
            onClick={() => void onAddCategory()}
          >
            <Plus />
            {t("addCategory")}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t("thresholdsTitle")}>
        {thresholds.map(([key, value, onChange]) => (
          <SettingsRow
            key={key}
            title={t(key)}
            control={
              <Input
                type="number"
                min={0}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                onBlur={() => {
                  if (thresholdsChanged) void onSaveThresholds();
                }}
                className="h-8 w-20 text-right tabular-nums"
              />
            }
          />
        ))}
      </SettingsSection>
    </div>
  );
}
