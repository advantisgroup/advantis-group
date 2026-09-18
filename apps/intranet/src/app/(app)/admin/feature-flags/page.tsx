"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { PowerOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

type Flag = NonNullable<ReturnType<typeof useFeatureFlags>>[number];

function ToggleDialog({
  flag,
  mode,
  onOpenChange,
}: {
  flag: Flag;
  mode: "disable" | "enable";
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("FeatureFlags");
  const tc = useTranslations("Common");
  const setFlag = useMutation(api.org.featureFlags.setFlag);
  const handleError = useErrorHandler();
  const [reasonMode, setReasonMode] = useState<"premade" | "custom">("premade");
  const [customReason, setCustomReason] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmBlocked = mode === "disable" && reasonMode === "custom" && !customReason.trim();

  async function confirm() {
    setBusy(true);
    try {
      if (mode === "disable") {
        await setFlag({
          key: flag.key,
          enabled: false,
          reason: reasonMode === "custom" ? customReason.trim() : undefined,
        });
        toast.success(t("disabledToast", { label: flag.label }));
      } else {
        await setFlag({
          key: flag.key,
          enabled: true,
          reason: followUp.trim() || undefined,
        });
        toast.success(t("enabledToast", { label: flag.label }));
      }
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          {mode === "disable"
            ? t("disableDialog.title", { label: flag.label })
            : t("enableDialog.title", { label: flag.label })}
        </DialogTitle>
        <DialogDescription>
          {mode === "disable" ? t("disableDialog.description") : t("enableDialog.description")}
        </DialogDescription>

        <div className="space-y-4">
          {mode === "disable" ? (
            <>
              <RadioGroup
                value={reasonMode}
                onValueChange={(v) => setReasonMode(v as "premade" | "custom")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="premade" id="reason-premade" className="mt-1" />
                  <Label htmlFor="reason-premade" className="flex-1 cursor-pointer font-normal">
                    <span className="block text-sm">{t("disableDialog.premade")}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {flag.premadeReason}
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="custom" id="reason-custom" className="mt-1" />
                  <Label
                    htmlFor="reason-custom"
                    className="flex-1 cursor-pointer text-sm font-normal"
                  >
                    {t("disableDialog.custom")}
                  </Label>
                </div>
              </RadioGroup>
              {reasonMode === "custom" && (
                <Textarea
                  autoFocus
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder={t("disableDialog.customPlaceholder")}
                  rows={3}
                />
              )}
            </>
          ) : (
            <Textarea
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={t("enableDialog.placeholder")}
              rows={3}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            variant={mode === "disable" ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={busy || confirmBlocked}
          >
            {mode === "disable" ? t("disableDialog.confirm") : t("enableDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagRow({ flag }: { flag: Flag }) {
  const t = useTranslations("FeatureFlags");
  const locale = useLocale();
  const [dialogMode, setDialogMode] = useState<"disable" | "enable" | null>(null);

  return (
    <Card nested>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{flag.label}</p>
            <Badge variant={flag.enabled ? "success" : "destructive"}>
              {flag.enabled ? t("enabled") : t("disabled")}
            </Badge>
          </div>
          {!flag.enabled && flag.reason && (
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{flag.reason}</p>
          )}
          {flag.updatedAt && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              {t("lastChanged", {
                date: formatDateTime(flag.updatedAt, locale),
              })}
            </p>
          )}
        </div>
        <Button
          variant={flag.enabled ? "destructive" : "secondary"}
          size="sm"
          className="shrink-0"
          onClick={() => setDialogMode(flag.enabled ? "disable" : "enable")}
        >
          {flag.enabled ? t("disableAction") : t("enableAction")}
        </Button>
      </CardContent>
      {dialogMode && (
        <ToggleDialog
          flag={flag}
          mode={dialogMode}
          onOpenChange={(o) => !o && setDialogMode(null)}
        />
      )}
    </Card>
  );
}

export default function FeatureFlagsPage() {
  const t = useTranslations("FeatureFlags");
  const isAdmin = useIsAdmin();
  const flags = useFeatureFlags();

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<PowerOff />} />
      <div className="space-y-3">
        {flags === undefined
          ? Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          : flags.map((flag) => <FlagRow key={flag.key} flag={flag} />)}
      </div>
    </section>
  );
}
