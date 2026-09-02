"use client";

import type React from "react";
import { useCallback, useState } from "react";

import { useSearchParams } from "next/navigation";

import { AlertCircle, Check, Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/eden";

type Outcome = "success" | "alreadyDelivered" | "invalid" | "expired" | "error";

const STATUS_BY_CODE: Record<number, Outcome> = {
  404: "invalid",
  410: "expired",
};

export function WhitepaperConfirm() {
  const t = useTranslations("whitepaper.confirm");
  const token = useSearchParams().get("token");

  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [email, setEmail] = useState("");

  const confirm = useCallback(async () => {
    if (!token) return;

    setPending(true);
    try {
      const response = await api.whitepaper.confirm.post({ token });

      if (response.status !== 200 || !response.data) {
        setOutcome(STATUS_BY_CODE[response.status] ?? "error");
        return;
      }

      setEmail(response.data.email);
      setOutcome(response.data.alreadyDelivered ? "alreadyDelivered" : "success");
      posthog.capture("Whitepaper - Confirmed");
    } catch {
      setOutcome("error");
    } finally {
      setPending(false);
    }
  }, [token]);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto max-w-2xl px-4 pb-24 pt-32">
        {!token ? (
          <Panel
            tone="error"
            title={t("missingToken.title")}
            description={t("missingToken.description")}
          >
            <Button asChild variant="outline">
              <Link href="/whitepaper">{t("requestCta")}</Link>
            </Button>
          </Panel>
        ) : outcome === null ? (
          <Panel tone="neutral" title={t("title")} description={t("description")}>
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("cta")}
            </Button>
          </Panel>
        ) : outcome === "success" || outcome === "alreadyDelivered" ? (
          <Panel
            tone="success"
            title={t(`${outcome}.title`)}
            description={t(`${outcome}.description`, { email })}
          />
        ) : (
          <Panel
            tone="error"
            title={t(`${outcome}.title`)}
            description={t(`${outcome}.description`)}
          >
            <Button asChild variant="outline">
              <Link href="/whitepaper">{t("requestCta")}</Link>
            </Button>
          </Panel>
        )}
      </main>
    </div>
  );
}

const TONE = {
  neutral: {
    icon: MailCheck,
    wrapper: "border-border/70 bg-background/70",
    accent: "text-advantis",
  },
  success: {
    icon: Check,
    wrapper: "border-emerald-500/25 bg-emerald-500/5",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  error: { icon: AlertCircle, wrapper: "border-red-500/25 bg-red-500/5", accent: "text-red-500" },
} as const;

function Panel({
  tone,
  title,
  description,
  children,
}: {
  tone: keyof typeof TONE;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const { icon: Icon, wrapper, accent } = TONE[tone];

  return (
    <div className={`space-y-4 rounded-4xl border p-8 text-center ${wrapper}`}>
      <Icon className={`mx-auto h-10 w-10 ${accent}`} />
      <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
      <p className="text-base text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
