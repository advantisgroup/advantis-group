"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * Shows until the person answers it. "Not now" stores the classic look as
 * their choice rather than a dismissal, so the banner and the Settings switch
 * read the same single preference and it follows them across devices.
 */
export function DesignPreviewBanner() {
  const t = useTranslations("Design");
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const handleError = useErrorHandler();

  if (prefs === undefined || prefs?.designPreview) return null;

  function choose(designPreview: "refreshed" | "classic") {
    setPrefs({ designPreview })
      .then(() => {
        if (designPreview === "refreshed") toast.success(t("enabledToast"));
      })
      .catch(handleError);
  }

  return (
    <div
      role="region"
      aria-label={t("bannerTitle")}
      className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-2.5 print:hidden md:px-6"
    >
      <span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:grid">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("bannerTitle")}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground md:line-clamp-1">
          {t("bannerBody")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => choose("classic")}>
          {t("notNow")}
        </Button>
        <Button size="sm" onClick={() => choose("refreshed")}>
          {t("tryIt")}
        </Button>
      </div>
    </div>
  );
}
