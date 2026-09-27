"use client";

import Image from "next/image";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Reveal } from "@/components/effects/Reveal";
import { Section, SectionHead } from "@/components/frame";
import { Link } from "@/i18n/navigation";
import { TEAM } from "@/lib/team";

/**
 * The people, by face and name.
 *
 * A service company is its people, and the homepage never showed one past
 * the hero photograph. Only the members with a portrait are here — a row of
 * initials in circles would say "we have no pictures" louder than it says
 * anything about the team. The full list is one click away.
 */
export const HomeTeam = () => {
  const t = useTranslations("team");
  const people = TEAM.flatMap(({ photo, ...member }) => (photo ? [{ ...member, photo }] : []));

  return (
    <Section size="loose" bordered={false}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHead align="left" title={t("home.title")} lede={t("home.lede")} />
        <Link
          href="/team"
          className="group inline-flex shrink-0 items-center gap-2 text-sm font-medium"
        >
          {t("home.cta")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <ul className="mt-14 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
        {people.map((member, index) => (
          <Reveal as="li" key={member.name} delay={index * 0.08} className="group">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
              <Image
                src={member.photo}
                alt={member.name}
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              />
            </div>
            <p className="mt-4 text-base font-semibold tracking-[-0.01em]">{member.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t(member.role)}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
};
