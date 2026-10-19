"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { Link } from "@/components/Link";

interface Source {
  key: string;
  href: string;
  icon: LucideIcon;
}

/**
 * The other places in the intranet that answer questions — the AI assistant,
 * the sales glossary, the Sales Coach knowledge base, the academy — each with
 * one line on what it's for, so the knowledge base is the one place to start
 * instead of one of five places people have to already know about.
 */
export function OtherKnowledgeSources() {
  const t = useTranslations("Guidebooks");
  const aiEnabled = useAiEnabled();

  const sources: Source[] = [
    ...(aiEnabled ? [{ key: "ask", href: "/wiki-chat", icon: Sparkles }] : []),
    // Lexikon, Coach-Wiki und Academy archiviert am 19.10.2026 (lib/maintenance.ts).
  ];

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("otherSources.title")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {t(`otherSources.${key}.title`)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t(`otherSources.${key}.when`)}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
