"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Briefcase, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useSave } from "@/hooks/use-save";

/**
 * The job currently advertised. Every CV import (upload or the application
 * inbox) files the new applicant under it; the job the CV names goes into
 * the notes.
 */
export function HrOpenPositionCard() {
  const settings = useQuery(api.hr.settings.get);
  if (settings === undefined) return null;
  return <OpenPositionForm key={settings.openPosition ?? ""} initial={settings.openPosition} />;
}

function OpenPositionForm({ initial }: { initial: string | null }) {
  const t = useTranslations("Applicants");
  const save = useSave(api.hr.settings.setOpenPosition);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (initial ?? "");

  async function submit() {
    setSaving(true);
    await save({ openPosition: value }, { success: t("openPositionSaved") });
    setSaving(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-1.5">
          <Briefcase className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{t("openPositionTitle")}</p>
          <InfoTip text={t("openPositionDescription")} />
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) void submit();
          }}
        >
          <Input
            value={value}
            maxLength={120}
            placeholder={t("openPositionPlaceholder")}
            aria-label={t("openPositionTitle")}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" size="sm" className="sm:h-9" disabled={!dirty || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("openPositionSave")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {initial ? t("openPositionActive") : t("openPositionNone")}
        </p>
      </CardContent>
    </Card>
  );
}
