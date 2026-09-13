"use client";

import { useState, type CSSProperties } from "react";

import { Cloud, Mail, PhoneCall, type LucideIcon } from "lucide-react";
import {
  siAnthropic,
  siClaude,
  siClerk,
  siConvex,
  siPosthog,
  siResend,
  siVercel,
  type SimpleIcon,
} from "simple-icons";

import { cn } from "@/lib/utils";

/**
 * Every product the intranet integrates with, and how to show it.
 *
 * Three tiers, best first, and a mark never pretends to be a tier it isn't:
 * 1. `logo` — the vendor's official file, dropped into `public/logos/`. Takes
 *    over automatically the moment the file exists.
 * 2. `glyph` — the CC0 mark from simple-icons, in the brand's own colour.
 * 3. `fallback` — a generic icon tinted in the brand's colour, for vendors
 *    (Microsoft, Salesforce, Genesys) whose marks aren't freely licensable.
 *    It's recognisably "theirs" by colour without redrawing their trademark.
 *
 * Brand colour is the point: it's where an otherwise quiet page picks up
 * colour, and why integrations get marks instead of their names.
 */
export type Provider =
  | "clockodo"
  | "genesys"
  | "onedrive"
  | "outlook"
  | "salesforce"
  | "anthropic"
  | "claude"
  | "clerk"
  | "convex"
  | "resend"
  | "posthog"
  | "vercel";

interface ProviderDef {
  name: string;
  logo?: string;
  glyph?: SimpleIcon;
  fallback?: LucideIcon;
  /** Brand colour for the fallback icon (glyphs carry their own). */
  color?: string;
}

const PROVIDERS: Record<Provider, ProviderDef> = {
  clockodo: { name: "Clockodo", logo: "/logos/clockodo.svg", color: "#3657F7" },
  genesys: { name: "Genesys", logo: "/logos/genesys.svg", fallback: PhoneCall, color: "#FF4F1F" },
  onedrive: { name: "OneDrive", logo: "/logos/onedrive.svg", fallback: Cloud, color: "#0078D4" },
  outlook: { name: "Outlook", logo: "/logos/outlook.svg", fallback: Mail, color: "#0078D4" },
  salesforce: {
    name: "Salesforce",
    logo: "/logos/salesforce.svg",
    fallback: Cloud,
    color: "#00A1E0",
  },
  anthropic: { name: "Anthropic", glyph: siAnthropic },
  claude: { name: "Claude", glyph: siClaude },
  clerk: { name: "Clerk", glyph: siClerk },
  convex: { name: "Convex", glyph: siConvex },
  resend: { name: "Resend", glyph: siResend },
  posthog: { name: "PostHog", glyph: siPosthog },
  vercel: { name: "Vercel", glyph: siVercel },
};

export function providerName(provider: Provider) {
  return PROVIDERS[provider].name;
}

/** A brand colour too close to black or white to read on one of the two
 * themes (Anthropic, Vercel, Resend are all near-black) takes the text colour
 * instead — the shape still identifies it. */
function readableHex(hex: string): string | undefined {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.035 || luminance > 0.85 ? undefined : `#${hex.replace("#", "")}`;
}

/**
 * The mark itself, sized by `className` (height drives it; defaults to 1rem).
 * Exported so callers can place it in slots the preset layouts below don't
 * cover — an icon button, a page header, a table cell.
 */
export function Mark({ provider, className }: { provider: Provider; className?: string }) {
  const def = PROVIDERS[provider];
  const [logoFailed, setLogoFailed] = useState(false);

  if (def.logo && !logoFailed) {
    return (
      // A plain <img onError> (not next/image) is what lets the next tier take
      // over while an official file hasn't been added yet.
      <img
        src={def.logo}
        alt={def.name}
        className={cn("h-4 w-auto shrink-0 object-contain align-middle", className)}
        onError={() => setLogoFailed(true)}
      />
    );
  }

  if (def.glyph) {
    const fill = readableHex(def.glyph.hex);
    return (
      <svg
        role="img"
        aria-label={def.name}
        viewBox="0 0 24 24"
        className={cn("size-4 shrink-0", !fill && "fill-current", className)}
        style={fill ? ({ fill } as CSSProperties) : undefined}
      >
        <path d={def.glyph.path} />
      </svg>
    );
  }

  if (def.fallback) {
    const Icon = def.fallback;
    return (
      <Icon
        role="img"
        aria-label={def.name}
        className={cn("size-4 shrink-0", className)}
        style={{ color: def.color }}
      />
    );
  }

  return (
    <span className={cn("font-semibold tracking-tight", className)} style={{ color: def.color }}>
      {def.name}
    </span>
  );
}

/**
 * Structured-UI badge: the mark first, the product name as a small caption.
 * For labelled rows, source badges and table cells — anywhere the product is
 * called out on its own rather than inside a sentence.
 */
export function ProviderBadge({ provider, className }: { provider: Provider; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Mark provider={provider} className="h-4" />
      <span className="text-[11px] font-medium text-muted-foreground">
        {providerName(provider)}
      </span>
    </span>
  );
}

/** Prose-safe mark, sized to sit inside a sentence that already names it. */
export function ProviderInline({ provider }: { provider: Provider }) {
  return (
    <Mark
      provider={provider}
      className="mx-0.5 inline-block h-[1em] w-auto translate-y-[-0.05em]"
    />
  );
}

const BRAND_PATTERN = /\b(Genesys|Clockodo|OneDrive|Outlook|Salesforce)\b/g;
const BRAND_BY_NAME: Record<string, Provider> = {
  Genesys: "genesys",
  Clockodo: "clockodo",
  OneDrive: "onedrive",
  Outlook: "outlook",
  Salesforce: "salesforce",
};

/**
 * Renders a plain string with each literal product name followed by its mark.
 * The name stays in the text (marks alongside, not instead) so a sentence
 * still reads when the mark is the tinted fallback. Both locale dictionaries
 * keep these names untranslated, so this works on help text, FAQ answers and
 * tooltips without hand-editing every string into JSX.
 */
export function BrandedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(BRAND_PATTERN);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        BRAND_BY_NAME[part] ? (
          <span key={i} className="whitespace-nowrap">
            <ProviderInline provider={BRAND_BY_NAME[part]} />
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
