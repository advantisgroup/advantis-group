"use client";

import { ArrowRight, Hand, MessagesSquare, Orbit, Palette, Shapes } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";

const SECTIONS = [
  { key: "drag", href: "/playground/drag", icon: Hand },
  { key: "motion", href: "/playground/motion", icon: Orbit },
  { key: "chat", href: "/playground/chat", icon: MessagesSquare },
  { key: "design", href: "/playground/design", icon: Palette },
  { key: "components", href: "/playground/components", icon: Shapes },
] as const;

export default function PlaygroundOverviewPage() {
  const t = useTranslations("Playground");

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-[14px] leading-relaxed text-pretty">{t("overview.intro")}</p>
      <nav className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {SECTIONS.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60"
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">{t(`tabs.${key}`)}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
                {t(`overview.${key}`)}
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </nav>
      <p className="text-[12.5px] text-muted-foreground">{t("overview.footnote")}</p>
    </div>
  );
}
