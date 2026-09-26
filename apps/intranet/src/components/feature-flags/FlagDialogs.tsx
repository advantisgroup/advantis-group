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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * The confirm step behind every feature-flag switch — shared by
 * /admin/feature-flags and the flags panel on the admin overview, so both
 * ask the same two things: what people are told, and whether it goes out as
 * an update.
 */

export type Flag = NonNullable<ReturnType<typeof useFeatureFlags>>[number];
export type FlagDialogMode = "disable" | "enable" | "post";

type Notify = "post" | "quiet";

function MessageField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        aria-describedby={`${id}-hint`}
        className="resize-none"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function Choice({ value, title, hint }: { value: Notify; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3.5 transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-muted/50">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/** Shared busy/close handling: one mutation, a toast, then close. */
function useSubmit(onOpenChange: (open: boolean) => void) {
  const handleError = useErrorHandler();
  const [busy, setBusy] = useState(false);

  async function submit(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await run();
      toast.success(done);
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return { busy, submit };
}

function DisableDialog({
  flag,
  onOpenChange,
}: {
  flag: Flag;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("FeatureFlags");
  const tc = useTranslations("Common");
  const setFlag = useMutation(api.org.featureFlags.setFlag);
  const { busy, submit } = useSubmit(onOpenChange);
  const [message, setMessage] = useState(flag.premadeReason);
  const [notify, setNotify] = useState<Notify>("post");
  const post = notify === "post";

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("disableDialog.title", { label: flag.label })}</DialogTitle>
          <DialogDescription>{t("disableDialog.description")}</DialogDescription>
        </DialogHeader>

        <MessageField
          id="flag-message"
          label={t("message")}
          hint={t("disableDialog.messageHint")}
          value={message}
          onChange={setMessage}
        />

        <div className="space-y-2">
          <p id="flag-notify" className="text-sm font-medium">
            {t("disableDialog.notify")}
          </p>
          <RadioGroup
            value={notify}
            onValueChange={(v) => setNotify(v as Notify)}
            aria-labelledby="flag-notify"
            className="gap-2 sm:grid-cols-2"
          >
            <Choice
              value="post"
              title={t("disableDialog.post")}
              hint={t("disableDialog.postHint")}
            />
            <Choice
              value="quiet"
              title={t("disableDialog.quiet")}
              hint={t("disableDialog.quietHint")}
            />
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void submit(
                () =>
                  setFlag({
                    key: flag.key,
                    enabled: false,
                    reason: message.trim() || undefined,
                    postUpdate: post,
                  }),
                t(post ? "disabledToast" : "disabledQuietToast", { label: flag.label }),
              )
            }
          >
            {t(post ? "disableDialog.confirmPost" : "disableDialog.confirmQuiet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnableDialog({
  flag,
  onOpenChange,
}: {
  flag: Flag;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("FeatureFlags");
  const tc = useTranslations("Common");
  const setFlag = useMutation(api.org.featureFlags.setFlag);
  const { busy, submit } = useSubmit(onOpenChange);
  const [followUp, setFollowUp] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("enableDialog.title", { label: flag.label })}</DialogTitle>
          <DialogDescription>
            {t("enableDialog.description", { label: flag.label })}{" "}
            {!flag.hasUpdate && t("enableDialog.noUpdate")}
          </DialogDescription>
        </DialogHeader>

        {flag.hasUpdate && (
          <MessageField
            id="flag-follow-up"
            label={t("enableDialog.followUp")}
            hint={t("enableDialog.followUpHint")}
            placeholder={t("enableDialog.placeholder", { label: flag.label })}
            value={followUp}
            onChange={setFollowUp}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void submit(
                () =>
                  setFlag({
                    key: flag.key,
                    enabled: true,
                    reason: followUp.trim() || undefined,
                  }),
                t("enabledToast", { label: flag.label }),
              )
            }
          >
            {t("enableDialog.confirm")}
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
  const { busy, submit } = useSubmit(onOpenChange);
  const [message, setMessage] = useState(flag.reason ?? flag.premadeReason);

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("postDialog.title", { label: flag.label })}</DialogTitle>
          <DialogDescription>
            {t("postDialog.description", { label: flag.label })}
          </DialogDescription>
        </DialogHeader>

        <MessageField
          id="flag-post-message"
          label={t("message")}
          hint={t("postDialog.messageHint")}
          value={message}
          onChange={setMessage}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void submit(
                () => postFlagUpdate({ key: flag.key, reason: message.trim() || undefined }),
                t("postedToast"),
              )
            }
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
  if (mode === "post") return <PostUpdateDialog flag={flag} onOpenChange={onOpenChange} />;
  if (mode === "enable") return <EnableDialog flag={flag} onOpenChange={onOpenChange} />;
  return <DisableDialog flag={flag} onOpenChange={onOpenChange} />;
}
