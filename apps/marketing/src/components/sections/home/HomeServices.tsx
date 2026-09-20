"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandEmphasis } from "@/components/effects/BrandEmphasis";
import { Section, SectionHead } from "@/components/frame";
import { ServiceGlyph } from "@/components/icons/ServiceGlyph";
import { Link } from "@/i18n/navigation";
import { SERVICE_SLUGS, VERTRIEBSTRAINING_TILE } from "@/lib/services";

/**
 * The capability index.
 *
 * This was a two-dimensional grid of cells beside a panel that resolved
 * whichever cell the pointer was on, with a swipeable carousel standing in
 * for it below `lg`. Three layouts, and the panel's content was a duplicate
 * of the cell's — so it was hidden from assistive tech, which meant half the
 * section existed only for a mouse.
 *
 * Twelve services, twelve rows, the same information for everyone. The
 * description is what makes the row worth reading; hiding it behind a hover
 * was the problem the panel was invented to solve.
 */
export const HomeServices = () => {
  const t = useTranslations("services");

  const entries = [
    ...SERVICE_SLUGS.map((slug) => ({
      key: slug,
      href: `/services/${slug}`,
      title: t(`items.${slug}.tileTitle`),
      description: t(`items.${slug}.tileDescription`),
    })),
    {
      key: "vertriebstraining",
      href: `/services/${VERTRIEBSTRAINING_TILE.slug}`,
      title: t("common.vertriebstrainingTile.title"),
      description: t("common.vertriebstrainingTile.description"),
    },
  ];

  return (
    <Section id="leistungen" size="loose">
      <SectionHead
        title={<BrandEmphasis tint="end">{t("title")}</BrandEmphasis>}
        lede={t("subtitle")}
      />

      <ul className="mt-16 grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <li key={entry.key}>
            <Link
              href={entry.href}
              className="group flex h-full flex-col border-t border-rule py-6 transition-colors hover:border-rule-strong"
            >
              <span className="flex items-start justify-between gap-3">
                <ServiceGlyph
                  slug={entry.key}
                  className="size-7 text-muted-foreground transition-colors group-hover:text-foreground"
                />
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-5 text-base font-semibold tracking-[-0.01em]">{entry.title}</span>
              <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {entry.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
};
