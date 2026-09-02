"use client";

import { useRef, useState } from "react";

import Image from "next/image";

import { motion, useScroll, useTransform } from "framer-motion";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { Display, PageField, Section } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const OFFICE_PHOTOS: { src: string; alt: string; size?: "sm" | "lg" }[] = [
  { src: "/office/office-teamwork.png", alt: "Team ADVANTIS GROUP", size: "lg" },
  { src: "/office/office-andrea-reichl.png", alt: "Team ADVANTIS GROUP" },
  { src: "/office/office-whiteboard.png", alt: "Team ADVANTIS GROUP" },
  { src: "/office/office-andrea-lautenbacher.png", alt: "Team ADVANTIS GROUP" },
  { src: "/office/office-morena-azzuro.png", alt: "Team ADVANTIS GROUP" },
];

function ParallaxPhoto({
  src,
  alt,
  className,
  speed,
}: {
  src: string;
  alt: string;
  className: string;
  speed: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${speed}%`, `${speed}%`]);

  return (
    <div ref={ref} className={`${className} relative overflow-hidden`}>
      <motion.div style={{ y }} className="absolute inset-[-15%]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 768px) 33vw, 50vw"
          className="object-cover"
        />
      </motion.div>
    </div>
  );
}

// Falls back to initials when the photo file doesn't exist yet (placeholders
// not generated) or fails to load.
function Avatar({
  photo,
  name,
  initials,
  className,
  fontSizeClassName,
}: {
  photo?: string;
  name: string;
  initials: string;
  className: string;
  fontSizeClassName: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!photo || errored) {
    return (
      <div
        className={`${className} flex items-center justify-center font-[family-name:var(--font-outfit)] font-bold tracking-[-0.02em] ${fontSizeClassName}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={`${className} relative overflow-hidden`}>
      <Image
        src={photo}
        alt={name}
        fill
        sizes="200px"
        className="object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

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
    { name: "Andrea Lautenbacher", role: t("roles.inbound"), initials: "AL" },
    {
      name: "Jessica Blume",
      role: t("roles.outbound"),
      initials: "JB",
      photo: "/team/jessica-blume.png",
    },
    { name: "Morena Azzuro", role: t("roles.hr"), initials: "MA" },
    {
      name: "Adam Kämpfer",
      role: t("roles.marketing"),
      initials: "AK",
      photo: "/team/adam-kaempfer.png",
    },
    {
      name: "Sabine Sagasser",
      role: t("roles.coach"),
      initials: "SS",
      photo: "/team/sabine-sagasser.png",
    },
    {
      name: "Martin Bergmüller",
      role: t("roles.quality"),
      initials: "MB",
      photo: "/team/martin-bergmueller.png",
    },
  ];

  const founder = teamMembers[0];

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <div className="relative">
        <section className="relative pt-32 pb-20 md:pt-44 md:pb-28">
          <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
            <Display as="h1" size="xl" className="max-w-[14ch]">
              {t("hero.titlePart1")} <span className="text-primary">ADVANTIS GROUP</span>
            </Display>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
              {t("hero.subtitle")}
            </p>
          </div>
        </section>

        <Section>
          <div className="tick-frame border border-rule bg-card/30 p-6 md:p-10">
            <div className="grid gap-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
              <div>
                <Avatar
                  photo={founder.photo}
                  name={founder.name}
                  initials={founder.initials}
                  fontSizeClassName="text-4xl md:text-5xl"
                  className="size-40 bg-primary/10 text-primary md:size-48"
                />
                <h2 className="mt-6 font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-[-0.025em]">
                  {founder.name}
                </h2>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
                  {founder.role}
                </p>

                {founder.email ? (
                  <Button
                    asChild
                    variant="outline"
                    className="mt-6 rounded-none border-rule-strong"
                  >
                    <Link href={`mailto:${founder.email}`}>
                      <Mail className="size-4" />
                      {t("founder.contactBtn")}
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div className="md:border-l md:border-rule md:pl-14">
                <Display size="md" as="p">
                  {t("founder.quote")}
                </Display>
                <p className="mt-8 text-base leading-[1.75] text-muted-foreground md:text-lg">
                  {founder.bio}
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <Display size="md">{t("grid.title")}</Display>
          <p className="mt-4 text-lg text-muted-foreground">{t("grid.subtitle")}</p>

          <div className="mt-12 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.slice(1).map((member, index) => (
              <div
                key={member.name}
                className="group flex items-center gap-5 bg-background p-6 transition-colors duration-300 hover:bg-card/60"
              >
                <Avatar
                  photo={member.photo}
                  name={member.name}
                  initials={member.initials}
                  fontSizeClassName="text-xl"
                  className="size-20 shrink-0 bg-muted/10 text-muted-foreground transition-colors duration-300 group-hover:text-primary"
                />
                <div className="min-w-0">
                  <span className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground/40">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-[family-name:var(--font-outfit)] text-lg font-bold tracking-[-0.02em]">
                    {member.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {OFFICE_PHOTOS.length > 0 ? (
          <Section size="loose">
            <div className="mx-auto max-w-2xl text-center">
              <Display size="md">{t("office.title")}</Display>
              <p className="mt-4 text-lg text-muted-foreground">{t("office.subtitle")}</p>
            </div>

            <div className="mt-14 grid auto-rows-[10rem] grid-cols-2 gap-px bg-rule md:auto-rows-[12rem] md:grid-cols-3">
              {OFFICE_PHOTOS.map((photo, index) => (
                <ParallaxPhoto
                  key={photo.src}
                  src={photo.src}
                  alt={photo.alt}
                  speed={8 + (index % 3) * 4}
                  className={photo.size === "lg" ? "col-span-2 row-span-2" : "row-span-2"}
                />
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
