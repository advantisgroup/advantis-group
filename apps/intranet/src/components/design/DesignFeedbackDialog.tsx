"use client";

import { useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Frown, Meh, Smile } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENTS = [
  { value: "positive", icon: Smile, labelKey: "sentimentPositive" },
  { value: "neutral", icon: Meh, labelKey: "sentimentNeutral" },
  { value: "negative", icon: Frown, labelKey: "sentimentNegative" },
] as const;

export function DesignFeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Design");
  const tc = useTranslations("Common");
  const pathname = usePathname();
  const submit = useMutation(api.designFeedback.submit);
  const handleError = useErrorHandler();
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!sentiment) return;
    setSending(true);
    try {
      await submit({ sentiment, message, path: pathname });
      toast.success(t("sent"));
      setSentiment(null);
      setMessage("");
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("dialogTitle")}
      description={t("dialogDescription")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={!sentiment || sending}
            onClick={() => void send()}
            className="max-sm:flex-1"
          >
            {t("sendFeedback")}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("dialogTitle")} className="grid grid-cols-3 gap-2">
        {SENTIMENTS.map(({ value, icon: Icon, labelKey }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={sentiment === value}
            onClick={() => setSentiment(value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors",
              sentiment === value
                ? "border-foreground/30 bg-foreground/[0.07] text-foreground"
                : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("messageLabel")}</span>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("messagePlaceholder")}
          className="min-h-28"
        />
      </label>
    </ResponsiveDialog>
  );
}
