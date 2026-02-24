"use client";

import { useState, useEffect, useRef } from "react";

import {
  TrendingUp,
  Zap,
  BookOpen,
  Brain,
  ArrowRight,
  ExternalLink,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandText } from "@/components/effects/BrandText";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default function UnsereMarken() {
  const t = useTranslations("brandsPage");
  const [visibleSections, setVisibleSections] = useState<Set<number>>(
    new Set()
  );
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const brands = [
    {
      icon: TrendingUp,
      name: "Salespirates",
      brand: "salespirates" as const,
      tagline: t("items.salespirates.tagline"),
      description: t("items.salespirates.description"),
      highlights: [
        t("items.salespirates.highlights.0"),
        t("items.salespirates.highlights.1"),
        t("items.salespirates.highlights.2"),
      ],
      url: "https://salespirates.de",
      brandColor: "text-salespirates",
      bgGradient: "from-salespirates/10 via-background to-background",
      glowColor: "shadow-salespirates/20",
    },
    {
      icon: Zap,
      name: "Rodeo-Consulting",
      brand: "rodeo" as const,
      tagline: t("items.rodeo.tagline"),
      description: t("items.rodeo.description"),
      highlights: [
        t("items.rodeo.highlights.0"),
        t("items.rodeo.highlights.1"),
        t("items.rodeo.highlights.2"),
      ],
      url: "https://rodeoconsulting.de",
      brandColor: "text-rodeo",
      bgGradient: "from-rodeo/10 via-background to-background",
      glowColor: "shadow-rodeo/20",
    },
    {
      icon: BookOpen,
      name: "Oldschool-train",
      brand: "oldschool-train" as const,
      tagline: t("items.oldschool.tagline"),
      description: t("items.oldschool.description"),
      highlights: [
        t("items.oldschool.highlights.0"),
        t("items.oldschool.highlights.1"),
        t("items.oldschool.highlights.2"),
      ],
      url: "https://oldschool-train.de",
      brandColor: "text-oldschool",
      bgGradient: "from-oldschool/10 via-background to-background",
      glowColor: "shadow-oldschool/20",
    },
    {
      icon: Brain,
      name: "Sales-AI-Germany",
      brand: "sales-ai-germany" as const,
      tagline: t("items.salesai.tagline"),
      description: t("items.salesai.description"),
      highlights: [
        t("items.salesai.highlights.0"),
        t("items.salesai.highlights.1"),
        t("items.salesai.highlights.2"),
      ],
      url: "https://sales-ai-germany.de",
      brandColor: "text-sales-ai",
      bgGradient: "from-sales-ai/10 via-background to-background",
      glowColor: "shadow-sales-ai/20",
    },
  ];

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionRefs.current.forEach((section, index) => {
      if (!section) return;

      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              setVisibleSections(prev => new Set(prev).add(index));
              if (entry.intersectionRatio > 0.2) {
                setActiveSection(index);
              }
            }
          });
        },
        { threshold: [0.1, 0.5] }
      );

      observer.observe(section);
      observers.push(observer);
    });

    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Immersive Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Large floating orbs - hidden on mobile to prevent overflow */}
        <div className="hidden md:block absolute top-20 left-[10%] w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div
          className="hidden md:block absolute bottom-20 right-[10%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto text-center space-y-10">
            {/* Animated badge */}
            <div className="animate-fade-in-down">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-primary/10 backdrop-blur-xl border border-primary/30 text-primary font-semibold shadow-xl shadow-primary/10">
                <Sparkles className="w-5 h-5 animate-pulse-slow" />
                <span className="text-sm md:text-base">{t("hero.badge")}</span>
              </div>
            </div>

            {/* Massive headline */}
            <div
              className="space-y-6 animate-fade-in-up"
              style={{ animationDelay: "0.2s" }}
            >
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9]">
                <span className="block">{t("hero.titlePrefix")}</span>
                <span className="block bg-linear-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                  {t("hero.titleSuffix")}
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <p
              className="text-xl md:text-3xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light animate-fade-in-up"
              style={{ animationDelay: "0.4s" }}
            >
              {t("hero.subtitle")}
            </p>

            {/* Scroll indicator */}
            <div
              className="pt-12 animate-fade-in-up"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="flex flex-col items-center gap-3 text-muted-foreground animate-bounce">
                <span className="text-sm font-medium">{t("hero.scroll")}</span>
                <ChevronDown className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-linear-to-b from-transparent to-background pointer-events-none" />
      </section>

      {/* Full-width Brand Sections - Each brand gets its own immersive section */}
      <div className="relative">
        {brands.map((brand, index) => {
          const Icon = brand.icon;
          const isVisible = visibleSections.has(index);
          const isActive = activeSection === index;
          const isEven = index % 2 === 0;

          return (
            <section
              id={brand.brand}
              key={index}
              ref={el => {
                sectionRefs.current[index] = el;
              }}
              className={cn(
                "relative min-h-screen flex items-center py-32 transition-all duration-1000",
                "border-b border-border/30"
              )}
            >
              {/* Brand-specific gradient background */}
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-0 opacity-0 transition-opacity duration-1000 bg-linear-to-br",
                    brand.bgGradient,
                    isVisible && "opacity-100",
                    !isActive && "opacity-0"
                  )}
                />
                {/* Noise texture */}
                <div className="absolute inset-0 noise-texture opacity-20" />
              </div>

              {/* Floating decorative elements - hidden on mobile */}
              <div
                className={cn(
                  "hidden md:block absolute top-1/4 right-[5%] w-80 h-80 rounded-full blur-3xl transition-all duration-1000",
                  brand.brandColor,
                  "opacity-0",
                  isActive && "opacity-5"
                )}
                style={{ background: "currentColor" }}
              />

              <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-7xl mx-auto">
                  <div className="grid lg:grid-cols-2 gap-16 items-center">
                    {/* Left: Content */}
                    <div
                      className={cn(
                        "space-y-8 opacity-0 transition-all duration-1000",
                        // initial translate depends on side so animation comes from correct direction
                        !isVisible &&
                          (isEven ? "translate-x-12" : "-translate-x-12"),
                        isVisible && "opacity-100 translate-x-0",
                        // ordering and text alignment on large screens
                        isEven
                          ? "lg:order-last lg:text-right lg:pr-12"
                          : "lg:order-first lg:text-left lg:pl-12"
                      )}
                      style={{ transitionDelay: "200ms" }}
                    >
                      {/* Icon with glow */}
                      <div
                        className={cn(
                          "inline-flex w-full",
                          isEven ? "lg:justify-end" : "lg:justify-start"
                        )}
                      ></div>

                      {/* Tagline */}
                      <div className="space-y-2">
                        <p
                          className={cn(
                            "text-sm uppercase tracking-[0.3em] font-bold transition-colors duration-500",
                            brand.brandColor
                          )}
                        >
                          {brand.tagline}
                        </p>
                        {/* Brand name - HUGE */}
                        <h2 className="text-5xl md:text-7xl font-bold leading-tight">
                          <BrandText brand={brand.brand} hoverable={false}>
                            {brand.name}
                          </BrandText>
                        </h2>
                      </div>

                      {/* Description */}
                      <p className="text-lg md:text-xl text-foreground/90 leading-relaxed max-w-2xl">
                        {brand.description}
                      </p>

                      {/* Highlights in a premium layout */}
                      <div className="grid grid-cols-1 gap-4 pt-4">
                        {brand.highlights.map((highlight, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-center gap-4 opacity-0 translate-x-4 transition-all duration-700",
                              isVisible && "opacity-100 translate-x-0"
                            )}
                            style={{ transitionDelay: `${400 + idx * 100}ms` }}
                          >
                            <div
                              className={cn(
                                "w-3 h-3 rounded-full transition-all duration-500",
                                brand.brandColor,
                                isActive && "shadow-lg scale-125",
                                brand.glowColor
                              )}
                              style={{ background: "currentColor" }}
                            />
                            <span className="text-base font-medium text-foreground/80">
                              {highlight}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* CTA Button */}
                      <div
                        className={cn(
                          "pt-6 flex",
                          isEven ? "lg:justify-end" : "lg:justify-start"
                        )}
                      >
                        <Button
                          asChild
                          size="lg"
                          className={cn(
                            "group/btn shadow-2xl transition-all duration-300 hover:scale-105",
                            brand.glowColor
                          )}
                        >
                          <Link
                            href={brand.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gap-3"
                          >
                            <span className="text-base font-semibold">
                              {t("learnMore")}
                            </span>
                            <ExternalLink className="w-5 h-5 transition-transform duration-300 group-hover/btn:rotate-12" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    {/* Right: Visual showcase with glassmorphism card */}
                    <div
                      className={cn(
                        "opacity-0 transition-all duration-1000",
                        // initial translate should mirror the content side
                        !isVisible &&
                          (isEven ? "-translate-x-12" : "translate-x-12"),
                        isVisible && "opacity-100 translate-x-0",
                        // ordering so visual appears opposite the content when isEven
                        isEven ? "lg:order-first" : "lg:order-last"
                      )}
                      style={{ transitionDelay: "400ms" }}
                    >
                      <div
                        className={cn(
                          "relative group",
                          isEven ? "lg:pl-12" : "lg:pr-12"
                        )}
                      >
                        {/* Glow effect */}
                        <div
                          className={cn(
                            "absolute -inset-4 rounded-3xl blur-2xl opacity-0 transition-opacity duration-500",
                            brand.brandColor,
                            isActive && "opacity-20"
                          )}
                          style={{ background: "currentColor" }}
                        />

                        {/* Main card */}
                        <div className="relative p-12 rounded-3xl bg-card/40 backdrop-blur-2xl border-2 border-border/50 overflow-hidden">
                          {/* Pattern overlay */}
                          <div className="absolute inset-0 dot-pattern opacity-30" />

                          {/* Content */}
                          <div className="relative space-y-8">
                            {/* Stats or highlights in a bento-style grid */}
                            <div className="grid grid-cols-2 gap-4">
                              {brand.highlights
                                .slice(0, 3)
                                .map((highlight, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "p-6 rounded-2xl bg-background/50 backdrop-blur-sm border border-border/30",
                                      idx === 2 && "col-span-2",
                                      "hover:border-primary/50 transition-all duration-300 hover:scale-105"
                                    )}
                                  >
                                    <div className="space-y-2">
                                      <div
                                        className={cn(
                                          "w-8 h-1 rounded-full",
                                          brand.brandColor
                                        )}
                                        style={{ background: "currentColor" }}
                                      />
                                      <p className="text-sm font-semibold text-foreground/90">
                                        {highlight}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                            </div>

                            {/* Large brand logo/text visualization */}
                            <div className="flex items-center justify-center p-8">
                              <Icon
                                className={cn(
                                  "w-32 h-32 opacity-10",
                                  brand.brandColor
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Bottom CTA - Full-width, dramatic */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-background to-background" />
          <div className="absolute inset-0 dot-pattern opacity-30" />
        </div>

        {/* Floating orbs - hidden on mobile to prevent overflow */}
        <div className="hidden md:block absolute top-1/4 left-[10%] w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />
        <div
          className="hidden md:block absolute bottom-1/4 right-[10%] w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse-slow"
          style={{ animationDelay: "1.5s" }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-10">
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              {t("cta.titlePart1")}{" "}
              <span className="bg-linear-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                {t("cta.titlePart2")}
              </span>
            </h2>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t("cta.description")}
            </p>

            <div className="pt-6">
              <Button
                asChild
                size="lg"
                className="group/cta shadow-2xl shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 hover:scale-105 px-8 py-7 text-lg"
              >
                <Link href="/contact">
                  <span>{t("cta.button")}</span>
                  <ArrowRight className="w-6 h-6 ml-3 transition-transform duration-300 group-hover/cta:translate-x-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
