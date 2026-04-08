"use client";

import { useEffect, useRef } from "react";

import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useTranslations } from "next-intl";

import { BrandText } from "../../effects/BrandText";

interface HomeFeaturesProps {
  isVisible: boolean;
}

function CountUp({
  to,
  suffix = "",
  className,
}: {
  to: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const value = useMotionValue(0);
  const springValue = useSpring(value, {
    stiffness: 55,
    damping: 18,
    restDelta: 0.001,
    duration: 2.5,
  });

  const displayValue = useTransform(springValue, current => {
    const val = Math.round(current);
    return val.toString().padStart(3, "0");
  });

  useEffect(() => {
    if (inView) {
      value.set(to);
    }
  }, [inView, to, value]);

  return (
    <span ref={ref} className={className}>
      <motion.span>{displayValue}</motion.span>
      {suffix}
    </span>
  );
}

export const HomeFeatures = ({ isVisible }: HomeFeaturesProps) => {
  const t = useTranslations("features");

  const principles = [
    {
      id: "01",
      title: t("feature1.title"),
      description: t("feature1.description"),
    },
    {
      id: "02",
      title: t("feature2.title"),
      description: t("feature2.description"),
    },
    {
      id: "03",
      title: t("feature3.title"),
      description: t("feature3.description"),
    },
  ];

  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.64_0.2_14_/_0.2),transparent_40%),radial-gradient(circle_at_85%_0%,oklch(0.76_0.16_68_/_0.12),transparent_45%)]" />
      <div className="absolute inset-0 bg-linear-to-b from-background via-background/95 to-background" />

      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
            <div
              className={`space-y-8 transition-[transform,opacity] duration-1000 ${
                isVisible
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-8 opacity-0"
              }`}
            >
              <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
                {t("eyebrow")}
              </p>
              <h2 className="font-[family-name:var(--font-outfit)] text-4xl leading-[1.05] md:text-6xl lg:text-7xl">
                {t("title")}{" "}
                <BrandText brand="advantis">{t("titleBrand")}</BrandText>?
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                {t("subtitle")}
              </p>

              <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-l border-primary/30 pl-6">
                <div>
                  <p className="text-4xl font-semibold tabular-nums text-primary md:text-5xl">
                    <CountUp to={15} suffix="+" />
                  </p>
                  <p className="mt-1 text-sm uppercase tracking-wider text-muted-foreground">
                    {t("stats.experience")}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-semibold tabular-nums text-primary md:text-5xl">
                    <CountUp to={500} suffix="+" />
                  </p>
                  <p className="mt-1 text-sm uppercase tracking-wider text-muted-foreground">
                    {t("stats.projects")}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-semibold tabular-nums text-primary md:text-5xl">
                    <CountUp to={4} />
                  </p>
                  <p className="mt-1 text-sm uppercase tracking-wider text-muted-foreground">
                    {t("stats.brands")}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-semibold tabular-nums text-primary md:text-5xl">
                    <CountUp to={100} suffix="%" />
                  </p>
                  <p className="mt-1 text-sm uppercase tracking-wider text-muted-foreground">
                    {t("stats.passion")}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`transition-[transform,opacity] duration-1000 delay-150 ${
                isVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
            >
              <ul className="divide-y divide-border/60 rounded-[2rem] border border-border/60 bg-card/30 backdrop-blur-sm">
                {principles.map(principle => {
                  return (
                    <li
                      key={principle.id}
                      className="group px-6 py-7 md:px-10 md:py-9"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
                        <span className="font-[family-name:var(--font-outfit)] text-sm tracking-[0.3em] text-primary/70 transition-colors group-hover:text-primary">
                          {principle.id}
                        </span>
                        <div className="space-y-2">
                          <h3 className="font-[family-name:var(--font-outfit)] text-2xl md:text-3xl">
                            {principle.title}
                          </h3>
                          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                            {principle.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
