"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * The confirm steps behind every feature-flag switch — shared by
 * /admin/feature-flags and the flags panel on the admin overview, so both
 * ask the same questions (message, post an update or not, "are you sure").
 */

export type Flag = NonNullable<ReturnType<typeof useFeatureFlags>>[number];
export type FlagDialogMode = "disable" | "enable" | "post";

type ReasonMode = "premade" | "custom";

function ReasonPicker({
  premadeLabel,
  premadeText,
  mode,
  onModeChange,
  custom,
  onCustomChange,
}: {
  premadeLabel: string;
  premadeText: string;
  mode: ReasonMode;
  onModeChange: (mode: ReasonMode) => void;
  custom: string;
  onCustomChange: (value: string) => void;
}) {
  const t = useTranslations("FeatureFlags");

  return (
    <>
      <RadioGroup value={mode} onValueChange={(v) => onModeChange(v as ReasonMode)}>
        <div className="flex items-start gap-2.5">
          <RadioGroupItem value="premade" id="reason-premade" className="mt-1" />
          <Label htmlFor="reason-premade" className="flex-1 cursor-pointer font-normal">
            <span className="block text-sm">{premadeLabel}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{premadeText}</span>
          </Label>
        </div>
        <div className="flex items-start gap-2.5">
          <RadioGroupItem value="custom" id="reason-custom" className="mt-1" />
          <Label htmlFor="reason-custom" className="flex-1 cursor-pointer text-sm font-normal">
            {t("disableDialog.custom")}
          </Label>
        </div>
      </RadioGroup>
      {mode === "custom" && (
        <Textarea
          autoFocus
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={t("disableDialog.customPlaceholder")}
          rows={3}
        />
      )}
    </>
  );
}

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
  const [reasonMode, setReasonMode] = useState<ReasonMode>("premade");
  const [customReason, setCustomReason] = useState("");
  const [postUpdate, setPostUpdate] = useState(true);
  // turning a feature off silently gets one extra "are you sure" step
  const [confirmingSilent, setConfirmingSilent] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmBlocked = mode === "disable" && reasonMode === "custom" && !customReason.trim();

  async function confirm() {
    if (mode === "disable" && !postUpdate && !confirmingSilent) {
      setConfirmingSilent(true);
      return;
    }

    setBusy(true);
    try {
      if (mode === "disable") {
        await setFlag({
          key: flag.key,
          enabled: false,
          reason: reasonMode === "custom" ? customReason.trim() : undefined,
          postUpdate,
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

  if (confirmingSilent) {
    return (
      <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t("disableDialog.silentTitle")}</DialogTitle>
          <DialogDescription>
            {t("disableDialog.silentBody", { label: flag.label })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingSilent(false)} disabled={busy}>
              {t("disableDialog.back")}
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
              {t("disableDialog.silentConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
          {mode === "disable"
            ? t(postUpdate ? "disableDialog.description" : "disableDialog.descriptionSilent", {
                label: flag.label,
              })
            : flag.hasUpdate
              ? t("enableDialog.description")
              : t("enableDialog.descriptionSilent", { label: flag.label })}
        </DialogDescription>

        <div className="space-y-4">
          {mode === "disable" ? (
            <>
              <ReasonPicker
                premadeLabel={t("disableDialog.premade")}
                premadeText={flag.premadeReason}
                mode={reasonMode}
                onModeChange={setReasonMode}
                custom={customReason}
                onCustomChange={setCustomReason}
              />
              <div className="flex items-start justify-between gap-4 border-t pt-4">
                <Label htmlFor="post-update" className="cursor-pointer font-normal">
                  <span className="block text-sm">{t("disableDialog.postUpdate")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {postUpdate
                      ? t("disableDialog.postUpdateHint")
                      : t("disableDialog.postUpdateLaterHint")}
                  </span>
                </Label>
                <Switch id="post-update" checked={postUpdate} onCheckedChange={setPostUpdate} />
              </div>
            </>
          ) : flag.hasUpdate ? (
            <Textarea
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={t("enableDialog.placeholder")}
              rows={3}
            />
          ) : null}
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

/** For a feature that was turned off without telling anyone: tell them now. */
function PostUpdateDialog({
  flag,
  onOpenChange,
}: {
  flag: Flag;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("FeatureFlags");
  const tc = useTranslations("Common");
  const postFlagUpdate = useMutation(api.org.featureFlags.postFlagUpdate);
  const handleError = useErrorHandler();
  const [reasonMode, setReasonMode] = useState<ReasonMode>("premade");
  const [customReason, setCustomReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await postFlagUpdate({
        key: flag.key,
        reason: reasonMode === "custom" ? customReason.trim() : undefined,
      });
      toast.success(t("postedToast"));
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
        <DialogTitle>{t("postDialog.title", { label: flag.label })}</DialogTitle>
        <DialogDescription>{t("postDialog.description", { label: flag.label })}</DialogDescription>
        <div className="space-y-4">
          <ReasonPicker
            premadeLabel={t("postDialog.current")}
            premadeText={flag.reason ?? flag.premadeReason}
            mode={reasonMode}
            onModeChange={setReasonMode}
            custom={customReason}
            onCustomChange={setCustomReason}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={busy || (reasonMode === "custom" && !customReason.trim())}
          >
            {t("postDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Opens whichever step `mode` asks for; the caller just tracks which one is open. */
export function FlagDialog({
  flag,
  mode,
  onClose,
}: {
  flag: Flag;
  mode: FlagDialogMode;
  onClose: () => void;
}) {
  const onOpenChange = (open: boolean) => !open && onClose();
  return mode === "post" ? (
    <PostUpdateDialog flag={flag} onOpenChange={onOpenChange} />
  ) : (
    <ToggleDialog flag={flag} mode={mode} onOpenChange={onOpenChange} />
  );
}
