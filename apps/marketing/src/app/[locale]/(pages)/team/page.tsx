"use client";

import { useTranslations } from "next-intl";

import { BrandEmphasis } from "@/components/effects/BrandEmphasis";
import { Display, PageHeader, Section, SectionHead } from "@/components/frame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { TEAM } from "@/lib/team";

export default function Team() {
  const t = useTranslations("team");

  const teamMembers = TEAM.map((member) => ({ ...member, role: t(member.role) }));
  const founder = {
    ...teamMembers[0],
    bio: t("founder.bio"),
    email: process.env.NEXT_PUBLIC_EMAIL_ADRESS,
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title={
          <>
            {t("hero.titlePart1")} <span className="text-primary">ADVANTIS GROUP</span>
          </>
        }
        lede={t("hero.subtitle")}
      />

      {/* The founder, and what she says the company is for. The quote leads;
          the portrait and the contact button sit beside it. */}
      <Section>
        <div className="grid gap-10 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:gap-16">
          <div>
            <Avatar className="size-36 md:size-44">
              {founder.photo ? (
                <AvatarImage src={founder.photo} alt={founder.name} className="object-cover" />
              ) : null}
              <AvatarFallback className="font-display text-4xl font-medium text-muted-foreground">
                {founder.initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="mt-6 text-xl font-semibold tracking-[-0.015em]">{founder.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{founder.role}</p>

            {founder.email ? (
              <Button asChild variant="outline" size="sm" className="mt-5">
                <Link href={`mailto:${founder.email}`}>{t("founder.contactBtn")}</Link>
              </Button>
            ) : null}
          </div>

          <div>
            <Display size="md" as="p" className="max-w-[26ch]">
              {t("founder.quote")}
            </Display>
            <p className="reading mt-8 max-w-[60ch] text-muted-foreground">{founder.bio}</p>
          </div>
        </div>
      </Section>

      <Section size="loose">
        <SectionHead
          align="left"
          size="md"
          title={<BrandEmphasis tint="start">{t("grid.title")}</BrandEmphasis>}
          lede={t("grid.subtitle")}
        />

        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.slice(1).map((member) => (
            <li key={member.name} className="flex items-center gap-4 border-t border-rule pt-6">
              <Avatar className="size-14 shrink-0">
                {member.photo ? (
                  <AvatarImage src={member.photo} alt={member.name} className="object-cover" />
                ) : null}
                <AvatarFallback className="text-sm font-medium text-muted-foreground">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold tracking-[-0.01em]">
                  {member.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{member.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
