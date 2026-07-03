"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Genesys and Clockodo are third-party trademarks referenced throughout
 * ActivityTrack (and the company-wide absences page). No official logo files
 * ship in this repo yet — drop the real assets at the paths below
 * (transparent-background SVG preferred) and every mark on the site upgrades
 * automatically. Until then each mark falls back to a plain styled wordmark,
 * so nothing here fabricates or approximates either company's actual
 * trademark.
 */
export type Provider = "genesys" | "clockodo";

const PROVIDER_META: Record<Provider, { name: string; logo: string }> = {
  genesys: { name: "Genesys", logo: "/logos/genesys.svg" },
  clockodo: { name: "Clockodo", logo: "/logos/clockodo.svg" },
};

/** The mark itself: the real logo if present, else the plain product name. */
function Mark({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  const meta = PROVIDER_META[provider];
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cn("font-semibold tracking-tight", className)}>
        {meta.name}
      </span>
    );
  }
  return (
    // A plain <img onError> (not next/image) is what makes the text fallback
    // work while the logo file may not exist yet.
    <img
      src={meta.logo}
      alt={meta.name}
      className={cn("h-4 w-auto object-contain align-middle", className)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Structured-UI badge: the logo (or fallback wordmark) as the primary
 * element, the product name as a small secondary caption. Use this for
 * labelled rows, source badges, table cells — anywhere the product is called
 * out on its own rather than inside a sentence.
 */
export function ProviderBadge({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  const meta = PROVIDER_META[provider];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Mark provider={provider} className="h-4" />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {meta.name}
      </span>
    </span>
  );
}

/**
 * Prose-safe mark: sized to sit inline in a sentence, no secondary caption
 * (the surrounding sentence already carries the name in context).
 */
export function ProviderInline({ provider }: { provider: Provider }) {
  return (
    <Mark
      provider={provider}
      className="mx-0.5 inline-block h-[1em] translate-y-[-0.05em]"
    />
  );
}

const BRAND_PATTERN = /\b(Genesys|Clockodo)\b/g;

/**
 * Renders a plain string, replacing every literal "Genesys"/"Clockodo"
 * mention with its `ProviderInline` mark. Both locale dictionaries keep
 * those brand names untranslated (see `lib/activity/locales/*`), so this
 * works for help text, FAQ answers, and tooltips without having to hand-edit
 * every string into JSX.
 */
export function BrandedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(BRAND_PATTERN);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part === "Genesys" || part === "Clockodo" ? (
          <ProviderInline key={i} provider={part.toLowerCase() as Provider} />
        ) : (
          part
        )
      )}
    </span>
  );
}
