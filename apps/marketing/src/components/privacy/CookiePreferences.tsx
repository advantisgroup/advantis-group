"use client";

import { useEffect, useState } from "react";

import { BarChart3, Lock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getConsent, setConsent } from "@/lib/consent";

const ESSENTIAL_USES = ["essential.uses.auth", "essential.uses.account", "essential.uses.safety"];
const ANALYTICS_USES = ["analytics.uses.usage", "analytics.uses.improve"];
const COMMITMENTS = ["commitments.sell", "commitments.train", "commitments.ads"];

const UsedFor = ({ label, items }: { label: string; items: string[] }) => (
  <div className="mt-4">
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
      {label}
    </span>
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border border-rule px-2 py-1 text-xs text-muted-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  </div>
);

/**
 * The one place a visitor can change their mind after the banner is gone.
 *
 * Two categories, not the usual four. Required: sign-in, account management
 * and account safety — the site genuinely can't work without them. Optional:
 * analytics (PostHog). Listing "Advertising" and "Personalisation" rows that
 * toggle nothing would be theatre — we don't set those cookies at all.
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
            <UsedFor label={t("usedFor")} items={ESSENTIAL_USES.map((key) => t(key))} />
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
            <UsedFor label={t("usedFor")} items={ANALYTICS_USES.map((key) => t(key))} />
          </div>
        </div>
      </div>

      {/* Theme is next-themes → localStorage, language is in the URL path.
          Neither is a cookie, so neither belongs in a category above. */}
      <p className="px-1 pt-2 text-sm text-muted-foreground">{t("localOnly")}</p>

      <p className="px-1 pt-1 text-sm text-muted-foreground">
        {mounted && decided
          ? analytics
            ? t("status.granted")
            : t("status.denied")
          : t("status.pending")}
      </p>

      {/*
       * The reason most people hesitate over an analytics toggle isn't the
       * measuring, it's what happens to the data afterwards. Saying so plainly
       * is worth more here than another category row.
       */}
      <div className="mt-6 rounded-xl border border-rule bg-background/40 p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.01em]">
          {t("commitments.title")}
        </h2>
        <ul className="mt-3 space-y-2">
          {COMMITMENTS.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" strokeWidth={2.5} />
              <span className="leading-relaxed">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
