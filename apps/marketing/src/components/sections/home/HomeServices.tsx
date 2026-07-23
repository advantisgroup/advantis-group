"use client";

import { type ComponentType, useRef } from "react";

import { useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  SERVICE_ICONS,
  SERVICE_SLUGS,
  VERTRIEBSTRAINING_TILE,
} from "@/lib/services";

const ServiceTile = ({
  href,
  icon: Icon,
  title,
  description,
  delay,
  isVisible,
}: {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  delay: number;
  isVisible: boolean;
}) => (
  <Link
    href={href}
    className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 shadow-sm transition-[transform,opacity,border-color,background-color,box-shadow] duration-500 hover:-translate-y-1 hover:border-primary/40 hover:bg-card/70 hover:shadow-xl hover:shadow-primary/10 ${
      isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
    }`}
    style={{
      transitionDelay: `${delay}ms`,
      willChange: isVisible ? "auto" : "transform, opacity",
    }}
  >
    <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,oklch(0.64_0.2_14_/_0.1),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

    <div className="relative flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <h3 className="font-[family-name:var(--font-outfit)] text-lg">
          {title}
        </h3>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
    </div>
    <p className="relative text-sm leading-relaxed text-muted-foreground">
      {description}
    </p>
  </Link>
);

export const HomeServices = () => {
  const t = useTranslations("services");
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="leistungen"
      ref={sectionRef}
      className="relative overflow-hidden py-16 md:py-20"
    >
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-7xl space-y-14">
          <div className="mx-auto max-w-3xl space-y-5 text-center">
            <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
              {t("eyebrow")}
            </p>
            <h2 className="font-[family-name:var(--font-outfit)] text-4xl leading-[1.05] md:text-5xl">
              {t("title")}
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("subtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_SLUGS.map((slug, idx) => (
              <ServiceTile
                key={slug}
                href={`/services/${slug}`}
                icon={SERVICE_ICONS[slug]}
                title={t(`items.${slug}.tileTitle`)}
                description={t(`items.${slug}.tileDescription`)}
                delay={idx * 60}
                isVisible={isVisible}
              />
            ))}
            <ServiceTile
              href={`/services/${VERTRIEBSTRAINING_TILE.slug}`}
              icon={VERTRIEBSTRAINING_TILE.icon}
              title={t("common.vertriebstrainingTile.title")}
              description={t("common.vertriebstrainingTile.description")}
              delay={SERVICE_SLUGS.length * 60}
              isVisible={isVisible}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
