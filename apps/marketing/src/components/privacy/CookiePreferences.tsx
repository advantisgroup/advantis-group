"use client";

import { useEffect, useState } from "react";

import { BarChart3, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getConsent, setConsent } from "@/lib/consent";

/**
 * The one place a visitor can change their mind after the banner is gone.
 *
 * Two categories, not the usual four: essential cookies (auth session,
 * language, this choice itself) and analytics (PostHog). Listing "Marketing"
 * and "Personalisation" rows that toggle nothing would be theatre — we don't
 * set those cookies.
 *
 * Changes apply the moment the switch flips. A settings page with a Save
 * button that people forget to press is the classic way consent silently
 * doesn't get recorded.
 */
export const CookiePreferences = () => {
  const t = useTranslations("cookiePreferences");
  const [analytics, setAnalytics] = useState(false);
  const [decided, setDecided] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const status = getConsent();
    setAnalytics(status === "granted");
    setDecided(status !== "pending");
    setMounted(true);
  }, []);

  const toggleAnalytics = (next: boolean) => {
    setConsent(next);
    setAnalytics(next);
    setDecided(true);
    toast.success(next ? t("analytics.enabled") : t("analytics.disabled"));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-rule bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-background/60 text-muted-foreground">
            <Lock className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.01em]">
                {t("essential.title")}
              </h2>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("essential.always")}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("essential.description")}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-rule bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-background/60 text-muted-foreground">
            <BarChart3 className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <label
                htmlFor="analytics-consent"
                className="cursor-pointer font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.01em]"
              >
                {t("analytics.title")}
              </label>
              {/* Rendered only after mount: before the effect reads the stored
                  choice the switch would show "off" for someone who accepted. */}
              <div className="ml-auto shrink-0">
                {mounted ? (
                  <Switch
                    id="analytics-consent"
                    checked={analytics}
                    onCheckedChange={toggleAnalytics}
                    aria-label={t("analytics.title")}
                  />
                ) : (
                  <div className="h-6 w-11 rounded-full bg-rule" />
                )}
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("analytics.description")}
            </p>
          </div>
        </div>
      </div>

      <p className="px-1 pt-2 text-sm text-muted-foreground">
        {mounted && decided
          ? analytics
            ? t("status.granted")
            : t("status.denied")
          : t("status.pending")}
      </p>
    </div>
  );
};
