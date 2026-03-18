"use client";

import { useTranslations } from "next-intl";

import { ClerkMount } from "@/components/auth/ClerkMount";

export const ClerkAuthCard = ({
  title,
  subtitle,
  variant,
}: {
  title: string;
  subtitle: string;
  variant: "signIn" | "signUp";
}) => {
  const t = useTranslations("auth");

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-background px-4 py-28">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-advantis/30 bg-advantis/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-advantis">
            {t("badge")}
          </span>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/70 p-4 shadow-2xl shadow-black/20 backdrop-blur md:p-6">
          <ClerkMount variant={variant} />
        </div>
      </div>
    </section>
  );
};
