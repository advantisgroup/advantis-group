"use client";

import { type ComponentType, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display } from "@/components/frame";
import { Section } from "@/components/frame/Section";
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from "@/components/ui/carousel";
import { Link } from "@/i18n/navigation";
import { SERVICE_ICONS, SERVICE_SLUGS, VERTRIEBSTRAINING_TILE } from "@/lib/services";

type Entry = {
  key: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
};

/**
 * The capability explorer.
 *
 * Twelve services as a single stacked list meant reading the whole column top
 * to bottom to find anything. Here the index is a two-column field you scan in
 * two dimensions, and the panel beside it resolves whichever cell the pointer
 * or keyboard is on — so the detail arrives without the reader having to walk
 * the list. Below `lg` the panel is dropped and the cells link straight
 * through, which is the right shape for a phone anyway.
 */
export const HomeServices = () => {
  const t = useTranslations("services");
  const [activeIndex, setActiveIndex] = useState(0);

  const entries: Entry[] = [
    ...SERVICE_SLUGS.map((slug) => ({
      key: slug,
      href: `/services/${slug}`,
      icon: SERVICE_ICONS[slug],
      title: t(`items.${slug}.tileTitle`),
      description: t(`items.${slug}.tileDescription`),
    })),
    {
      key: "vertriebstraining",
      href: `/services/${VERTRIEBSTRAINING_TILE.slug}`,
      icon: VERTRIEBSTRAINING_TILE.icon,
      title: t("common.vertriebstrainingTile.title"),
      description: t("common.vertriebstrainingTile.description"),
    },
  ];

  const active = entries[activeIndex] ?? entries[0];
  const ActiveIcon = active.icon;

  return (
    <Section id="leistungen">
      <div className="max-w-3xl">
        <Display size="lg">{t("title")}</Display>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl">
          {t("subtitle")}
        </p>
      </div>

      {/* lg+: a two-dimensional index beside a panel that resolves whichever
          cell the pointer or keyboard is on — hovering costs nothing here. */}
      <div className="mt-14 hidden gap-12 lg:mt-16 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-x-16">
        <div className="grid gap-px self-start overflow-hidden rounded-xl bg-rule sm:grid-cols-2">
          {entries.map((entry, index) => (
            <Link
              key={entry.key}
              href={entry.href}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              className={`group relative flex items-center gap-3 bg-background px-4 py-5 transition-colors duration-300 focus-visible:outline-none ${
                index === activeIndex ? "lg:bg-card/70" : "hover:bg-card/50"
              }`}
            >
              <span
                className={`font-mono text-[11px] tracking-[0.2em] transition-colors duration-300 ${
                  index === activeIndex
                    ? "text-primary"
                    : "text-muted-foreground/45 group-hover:text-primary"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 font-[family-name:var(--font-outfit)] text-base font-semibold tracking-[-0.02em] md:text-lg">
                {entry.title}
              </span>
              <ArrowUpRight
                className={`size-4 shrink-0 text-primary transition-opacity duration-300 ${
                  index === activeIndex ? "lg:opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              />
            </Link>
          ))}
        </div>

        {/*
         * Mirrors whichever cell the pointer or keyboard is on. It duplicates
         * text already reachable in the index, so it is hidden from assistive
         * tech.
         */}
        <div
          aria-hidden
          className="self-start rounded-xl border border-rule bg-card/40 p-8 lg:sticky lg:top-28"
        >
          <div key={active.key} className="animate-panel-in">
            <div className="flex items-start justify-between gap-6">
              <span className="font-[family-name:var(--font-outfit)] text-6xl font-bold leading-none tracking-[-0.05em] text-primary/35">
                {String(activeIndex + 1).padStart(2, "0")}
              </span>
              <ActiveIcon className="size-9 text-primary" strokeWidth={1.25} />
            </div>

            <Display size="sm" as="p" className="mt-8">
              {active.title}
            </Display>

            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {active.description}
            </p>
          </div>

          <div className="hatch mt-8 h-8 border-t border-rule opacity-60" />
        </div>
      </div>

      {/*
       * Below `lg` there's no room for an index-plus-panel, and the old
       * fallback (a flat list that just linked through) dropped the detail
       * entirely — a phone got a worse version of the section, not a
       * different one. A swipeable carousel keeps the same icon, title, and
       * description the desktop panel shows, one card at a time.
       */}
      <Carousel opts={{ align: "start", dragFree: true }} className="mt-14 lg:hidden">
        <CarouselContent>
          {entries.map((entry, index) => (
            <CarouselItem key={entry.key} className="basis-[82%] sm:basis-[45%]">
              <Link
                href={entry.href}
                className="group flex h-full flex-col rounded-xl border border-rule bg-card/40 p-6 transition-colors hover:bg-card/60"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-primary/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <entry.icon className="size-7 text-primary" strokeWidth={1.25} />
                </div>
                <h3 className="mt-6 font-[family-name:var(--font-outfit)] text-lg font-bold tracking-[-0.02em]">
                  {entry.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {entry.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("common.learnMore")}
                  <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselDots />
      </Carousel>
    </Section>
  );
};
