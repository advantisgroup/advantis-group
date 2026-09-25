"use client";

import type React from "react";
import { useCallback, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useUser } from "@clerk/nextjs";
import { AlertCircle, ArrowRight, Check, Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useTrackEvent } from "@/lib/analytics";
import { api } from "@/lib/eden";

type Outcome = "success" | "alreadyDelivered" | "invalid" | "expired" | "error";

const STATUS_BY_CODE: Record<number, Outcome> = {
  404: "invalid",
  410: "expired",
};

const TONE = {
  neutral: {
    icon: MailCheck,
    ring: "bg-muted",
    accent: "text-muted-foreground",
  },
  success: {
    icon: Check,
    ring: "bg-success/15",
    accent: "text-success-foreground dark:text-success",
  },
  error: {
    icon: AlertCircle,
    ring: "bg-red-500/10 ring-red-500/5",
    accent: "text-red-500",
  },
} as const;

export function WhitepaperConfirm() {
  const t = useTranslations("whitepaper.confirm");
  const token = useSearchParams().get("token");
  const trackEvent = useTrackEvent();
  const { isSignedIn } = useUser();

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
      trackEvent("Whitepaper - Confirmed");
    } catch {
      setOutcome("error");
    } finally {
      setPending(false);
    }
  }, [token, trackEvent]);

  const retry = (
    <Button asChild variant="outline" className="group">
      <Link href="/whitepaper">
        {t("requestCta")}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.64_0.2_14_/_0.14),transparent_50%)]" />
      <div className="absolute inset-0 bg-linear-to-b from-transparent to-background" />

      <main className="container relative z-10 mx-auto max-w-xl px-4 pb-24 pt-36">
        {!token ? (
          <Panel
            tone="error"
            title={t("missingToken.title")}
            description={t("missingToken.description")}
          >
            {retry}
          </Panel>
        ) : outcome === null ? (
          <Panel tone="neutral" title={t("title")} description={t("description")}>
            <Button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="h-12 px-8 text-base shadow-xl shadow-advantis/15"
            >
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
            description={t.rich(`${outcome}.description`, {
              email,
              b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          >
            {/* the whitepaper is the start of a conversation; say what the next step is */}
            <div className="space-y-4 border-t border-rule pt-6">
              <p className="text-[15px] leading-relaxed text-muted-foreground">{t("next.body")}</p>
              <Button asChild shape="pill" className="group">
                <Link href={{ pathname: "/contact", query: { mode: "callback" } }}>
                  {t("next.cta")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <p className="text-[13px] text-muted-foreground">
                {isSignedIn
                  ? t.rich("next.inAccount", {
                      link: (chunks) => (
                        <Link href="/account/downloads" className="underline underline-offset-2">
                          {chunks}
                        </Link>
                      ),
                    })
                  : t.rich("next.account", {
                      link: (chunks) => (
                        <Link href="/sign-up" className="underline underline-offset-2">
                          {chunks}
                        </Link>
                      ),
                    })}
              </p>
            </div>
          </Panel>
        ) : (
          <Panel
            tone="error"
            title={t(`${outcome}.title`)}
            description={t(`${outcome}.description`)}
          >
            {retry}
          </Panel>
        )}
      </main>
    </div>
  );
}

function Panel({
  tone,
  title,
  description,
  children,
}: {
  tone: keyof typeof TONE;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { icon: Icon, ring, accent } = TONE[tone];

  return (
    <div className="space-y-6 rounded-xl border border-rule bg-card p-8 text-center md:p-12">
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ring-8 ${ring}`}
      >
        <Icon className={`h-7 w-7 ${accent}`} />
      </span>
      <div className="space-y-3">
        <h1 className="text-3xl leading-tight md:text-4xl">{title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
