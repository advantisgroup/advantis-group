"use client";

import { type ComponentType, useState } from "react";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandEmphasis } from "@/components/effects/BrandEmphasis";
import { Reveal } from "@/components/effects/Reveal";
import { Section, SectionHead } from "@/components/frame";
import { ServiceGlyph } from "@/components/icons/ServiceGlyph";
import { ChatThread, LeadFunnel, SystemGrid } from "@/components/illustrations/HomeIllustrations";
import { Link } from "@/i18n/navigation";
import { type ServiceSlug, VERTRIEBSTRAINING_TILE } from "@/lib/services";

const GROUPS: {
  key: "conversations" | "business" | "systems";
  Illustration: ComponentType<{ className?: string; focus?: number | null }>;
  services: (ServiceSlug | "vertriebstraining")[];
}[] = [
  {
    key: "conversations",
    Illustration: ChatThread,
    services: ["customer-care", "contact-center", "customer-experience"],
  },
  {
    key: "business",
    Illustration: LeadFunnel,
    services: [
      "telesales",
      "new-customer-acquisition",
      "lead-management",
      "sales-outsourcing",
      "business-development",
    ],
  },
  {
    key: "systems",
    Illustration: SystemGrid,
    services: ["ai-automation", "crm", "sales-academy", "vertriebstraining"],
  },
];

/**
 * The capability index, in the three things the services add up to: the
 * conversations with existing customers, winning new ones, and the systems
 * and skills underneath both.
 *
 * Twelve equal tiles gave the reader nothing to hold on to. Three groups,
 * each with a drawing of what it does, is a shape you can take in at a
 * glance — and every service is still a link with its own line of text.
 *
 * Pointing at (or tabbing to) a service makes its group's drawing answer:
 * the message, the funnel stage or the block that service stands for lights
 * up.
 */
export const HomeServices = () => {
  const t = useTranslations("services");
  const [focus, setFocus] = useState<{ group: string; index: number } | null>(null);

  const entry = (key: ServiceSlug | "vertriebstraining") =>
    key === "vertriebstraining"
      ? {
          href: `/services/${VERTRIEBSTRAINING_TILE.slug}`,
          title: t("common.vertriebstrainingTile.title"),
          description: t("common.vertriebstrainingTile.description"),
        }
      : {
          href: `/services/${key}`,
          title: t(`items.${key}.tileTitle`),
          description: t(`items.${key}.tileDescription`),
        };

  return (
    <Section id="leistungen" size="loose" bordered={false}>
      <Reveal>
        <SectionHead
          align="left"
          title={<BrandEmphasis tint="end">{t("title")}</BrandEmphasis>}
          lede={t("subtitle")}
        />
      </Reveal>

      <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-6 lg:gap-8">
        {GROUPS.map(({ key, Illustration, services }, groupIndex) => (
          <Reveal key={key} delay={groupIndex * 0.12}>
            <Illustration focus={focus?.group === key ? focus.index : null} />
            <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em]">
              {t(`groups.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(`groups.${key}.text`)}
            </p>

            <ul className="mt-5">
              {services.map((service, index) => {
                const { href, title, description } = entry(service);

                return (
                  <li key={service}>
                    <Link
                      href={href}
                      onMouseEnter={() => setFocus({ group: key, index })}
                      onMouseLeave={() => setFocus(null)}
                      onFocus={() => setFocus({ group: key, index })}
                      onBlur={() => setFocus(null)}
                      className="group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3 border-t border-rule py-4"
                    >
                      <ServiceGlyph
                        slug={service}
                        className="mt-0.5 size-6 text-muted-foreground transition-colors group-hover:text-foreground"
                      />
                      <span>
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-muted-foreground">
                          {description}
                        </span>
                      </span>
                      <ArrowRight className="mt-1 size-3.5 text-muted-foreground transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        ))}
      </div>
    </Section>
  );
};
