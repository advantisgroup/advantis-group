"use client";

import { Mail, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { ShapeParticles } from "@/components/effects/ShapeParticles";
import { SectionDivider } from "@/components/layout/SectionDivider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function Team() {
  const t = useTranslations("team");
  const teamMembers = [
    {
      name: "Andrea Reichl",
      role: t("founder.role"),
      initials: "AR",
      bio: t("founder.bio"),
      email: `${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
    },
    {
      name: "Andrea Lautenbacher",
      role: t("roles.inbound"),
      initials: "AL",
    },
    {
      name: "Jessica Blume",
      role: t("roles.outbound"),
      initials: "JB",
    },
    {
      name: "Kaleb Daniel",
      role: t("roles.it"),
      initials: "KD",
    },
    {
      name: "Morena Azzuro",
      role: t("roles.hr"),
      initials: "MA",
    },
    {
      name: "Sebastian Kämpfer",
      role: t("roles.marketing"),
      initials: "SK",
    },
    {
      name: "Sabine Sagasser",
      role: t("roles.coach"),
      initials: "SS",
    },
    {
      name: "Martin Bergmüller",
      role: t("roles.quality"),
      initials: "MB",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <main className="relative z-30">
        {/* Hero Section */}
        <section className="relative h-screen flex items-center justify-center pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <ShapeParticles particleCount={40} className="opacity-30" />
          </div>

          <div className="container mx-auto px-4 md:px-6 relative -top-[10vh]">
            <ScrollReveal>
              <div className="max-w-4xl mx-auto text-center space-y-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  {t("hero.badge")}
                </div>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
                  {t("hero.titlePart1")} <br />
                  <BrandText
                    brand="advantis"
                    className="text-transparent bg-clip-text bg-linear-to-r from-primary to-primary/60"
                  >
                    Advantis Group
                  </BrandText>
                </h1>
                <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  {t("hero.subtitle")}
                </p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <SectionDivider variant="dots" opacity={0.3} className="mb-20" />

        <div className="container mx-auto px-4 md:px-6 pb-32 max-w-7xl">
          {/* Founder Section */}
          <ScrollReveal delay={200}>
            <section className="mb-32 relative">
              <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-secondary/5 rounded-3xl blur-3xl -z-10" />

              <div className="bg-card/30 backdrop-blur-md border border-white/10 rounded-3xl p-8 md:p-12 overflow-hidden relative group">
                {/* Decorative glow */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/20 transition-colors duration-700" />

                <div className="grid md:grid-cols-12 gap-12 items-center">
                  <div className="md:col-span-4 flex flex-col items-center md:items-start text-center md:text-left">
                    <div className="relative mb-6">
                      <div className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-linear-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-4xl md:text-5xl font-bold text-primary border-4 border-background shadow-2xl relative z-10 group-hover:scale-105 transition-transform duration-500">
                        {teamMembers[0].initials}
                      </div>
                      {/* Orbiting particles or rings could go here */}
                      <div className="absolute inset-0 border border-primary/20 rounded-full scale-110 animate-pulse-slow" />
                      <div className="absolute inset-0 border border-dashed border-primary/20 rounded-full scale-125 animate-spin-slow" />
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-3xl font-bold">{teamMembers[0].name}</h2>
                      <p className="text-lg text-primary font-medium">{teamMembers[0].role}</p>
                    </div>

                    {teamMembers[0].email && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-4 -ml-2 text-muted-foreground hover:text-primary"
                        asChild
                      >
                        <Link href={`mailto:${teamMembers[0].email}`}>
                          <Mail className="w-4 h-4 mr-2" />
                          {t("founder.contactBtn")}
                        </Link>
                      </Button>
                    )}
                  </div>

                  <div className="md:col-span-8 space-y-6">
                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-2">
                      {t("founder.badge")}
                    </div>
                    <h3 className="text-2xl md:text-4xl font-bold leading-tight">
                      {t("founder.quote")}
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      {teamMembers[0].bio}
                    </p>

                    <div className="pt-6 flex gap-4">
                      {/* Social links or extra info could go here */}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </ScrollReveal>

          {/* Team Grid */}
          <section>
            <ScrollReveal delay={100} className="mb-12 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold">{t("grid.title")}</h2>
              <p className="text-muted-foreground mt-2">{t("grid.subtitle")}</p>
            </ScrollReveal>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {teamMembers.slice(1).map((member, index) => (
                <ScrollReveal key={member.name || index} delay={index * 100} className="h-full">
                  <div className="group h-full relative bg-card/40 hover:bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-primary/5 overflow-hidden">
                    {/* Hover Gradient */}
                    <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col items-center text-center h-full">
                      <div className="mb-6 relative">
                        <div className="w-24 h-24 rounded-2xl bg-linear-to-br from-background to-muted flex items-center justify-center text-2xl font-bold text-muted-foreground group-hover:text-primary group-hover:from-primary/10 group-hover:to-primary/5 transition-all duration-300 shadow-inner">
                          {member.initials}
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-background rounded-full flex items-center justify-center border border-border opacity-0 group-hover:opacity-100 transition-all duration-300 delay-100 scale-0 group-hover:scale-100">
                          <ArrowRight className="w-4 h-4 text-primary -rotate-45" />
                        </div>
                      </div>

                      <h3 className="text-lg font-bold mb-1 group-hover:text-primary transition-colors">
                        {member.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">{member.role}</p>

                      <div className="mt-auto pt-4 border-t border-border/50 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                        <span className="text-xs font-medium text-primary uppercase tracking-wider">
                          {t("grid.cardFooter")}
                        </span>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
