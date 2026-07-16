"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/use-error-handler";

const SAVE_DEBOUNCE_MS = 600;

export function DepartmentStep() {
  const t = useTranslations("Onboarding");
  const ts = useTranslations("Settings");
  const user = useCurrentUser();
  const updateProfile = useAction(api.users.updateProfile);
  const handleError = useErrorHandler();
  const [department, setDepartment] = useState(user.department ?? "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(value: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateProfile({ department: value }).catch(handleError);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <div className="space-y-5">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 className="size-5" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("departmentTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("departmentHint")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>{ts("department")}</Label>
        <Input
          value={department}
          placeholder={t("departmentPlaceholder")}
          onChange={e => {
            setDepartment(e.target.value);
            scheduleSave(e.target.value);
          }}
          onBlur={() => scheduleSave(department)}
        />
      </div>
    </div>
  );
}
