"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const HomeBrands = () => {
  const t = useTranslations("brands");
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -100px 0px" }
    );

    const node = sectionRef.current;
    if (node) observer.observe(node);
    return () => {
      if (node) observer.unobserve(node);
    };
  }, []);

  const brands = [
    {
      name: "Salespirates",
      brand: "salespirates" as const,
      tagline: t("salespirates.tagline"),
      description: t("salespirates.description"),
    },
    {
      name: "Rodeo-Consulting",
      brand: "rodeo" as const,
      tagline: t("rodeo.tagline"),
      description: t("rodeo.description"),
    },
    {
      name: "Oldschool-train",
      brand: "oldschool-train" as const,
      tagline: t("oldschool.tagline"),
      description: t("oldschool.description"),
    },
    {
      name: "Sales-AI-Germany",
      brand: "sales-ai-germany" as const,
      tagline: t("salesai.tagline"),
      description: t("salesai.description"),
    },
  ];

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 bg-linear-to-b from-background via-primary/4 to-primary/8" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,oklch(0.64_0.2_14_/_0.12),transparent)] [background-size:100%_1px] [background-position:0_30%] [background-repeat:no-repeat]" />
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-linear-to-b from-transparent via-primary/8 to-primary/10 pointer-events-none" />

      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto max-w-7xl space-y-14 md:space-y-16">
          <div
            className={cn(
              "space-y-5 text-left transition-[transform,opacity] duration-1000",
              isVisible
                ? "translate-y-0 opacity-100"
                : "-translate-y-8 opacity-0"
            )}
            style={{ willChange: isVisible ? "auto" : "transform, opacity" }}
          >
            <p className="font-[family-name:var(--font-outfit)] text-xs uppercase tracking-[0.35em] text-primary/80">
              {t("eyebrow")}
            </p>
            <h2 className="font-[family-name:var(--font-outfit)] text-4xl leading-[1.05] md:text-6xl lg:text-7xl">
              {t("title")}{" "}
              <span className="text-primary">{t("titleHighlight")}</span>
            </h2>
            <p className="max-w-3xl text-lg text-muted-foreground md:text-2xl">
              {t("subtitle")}
            </p>
          </div>

          <div className="border-y border-border/60">
            {brands.map((brand, idx) => {
              return (
                <Link
                  key={brand.name}
                  href={`/brands#${brand.brand}`}
                  className={cn(
                    "group block border-b border-border/60 last:border-b-0",
                    "transition-[transform,opacity] duration-700",
                    isVisible
                      ? "translate-y-0 opacity-100"
                      : "translate-y-8 opacity-0"
                  )}
                  style={{
                    transitionDelay: `${idx * 120 + 180}ms`,
                    willChange: isVisible ? "auto" : "transform, opacity",
                  }}
                >
                  <div className="grid gap-5 px-2 py-7 md:grid-cols-[1.3fr_1fr_auto] md:items-center md:gap-8 md:px-4 md:py-9">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        {brand.tagline}
                      </p>
                      <h3 className="mt-2 font-[family-name:var(--font-outfit)] text-3xl md:text-5xl">
                        <BrandText brand={brand.brand} hoverable={false}>
                          {brand.name}
                        </BrandText>
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                      {brand.description}
                    </p>
                    <div className="flex items-center justify-start md:justify-end">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/40 transition-all duration-300 group-hover:border-primary/60 group-hover:bg-primary/10">
                        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div
            className={cn(
              "pt-2 transition-[transform,opacity] duration-1000 delay-500",
              isVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0"
            )}
            style={{ willChange: isVisible ? "auto" : "transform, opacity" }}
          >
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-8 font-medium"
            >
              <Link href="/brands">
                {t("cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
