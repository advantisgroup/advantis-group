"use client";

import { useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Frown, Meh, Smile } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENTS = [
  { value: "positive", icon: Smile, labelKey: "sentimentPositive", tone: "text-ok" },
  { value: "neutral", icon: Meh, labelKey: "sentimentNeutral", tone: "text-warn" },
  { value: "negative", icon: Frown, labelKey: "sentimentNegative", tone: "text-destructive" },
] as const;

/**
 * "Feedback on this page": a mood and a note, sent with the path the person
 * was on so whoever reads it (Admin → Page feedback) knows where to look.
 */
export function PageFeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Design");
  const tc = useTranslations("Common");
  const pathname = usePathname();
  const handleError = useErrorHandler();
  const submit = useMutation(api.designFeedback.submit);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSentiment(null);
      setMessage("");
    }
  }

  async function send() {
    if (!sentiment) return;
    setSending(true);
    try {
      await submit({ sentiment, message, path: pathname });
      toast.success(t("sent"));
      close(false);
    } catch (error) {
      handleError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t("dialogTitle")}
      description={t("dialogDescription")}
      contentClassName="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={!sentiment || sending} onClick={() => void send()}>
            {t("sendFeedback")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label={t("sentimentLabel")} className="grid grid-cols-3 gap-2">
          {SENTIMENTS.map(({ value, icon: Icon, labelKey, tone }) => {
            const active = sentiment === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSentiment(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5", active && tone)} />
                {t(labelKey)}
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="page-feedback-message">{t("messageLabel")}</Label>
          <Textarea
            id="page-feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            rows={4}
            maxLength={4000}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
