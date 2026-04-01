"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { BrandText } from "../../effects/BrandText";
import { Button } from "../../ui/button";

export const Hero = () => {
  const t = useTranslations("hero");

  return (
    <section className="relative h-screen flex items-center">
      {/* Additional decorative floating elements - hidden on mobile to prevent overflow */}
      <div className="hidden md:block absolute top-[20%] left-[15%] w-96 h-96 bg-primary/8 rounded-full blur-3xl animate-pulse-slow" />
      <div
        className="hidden md:block absolute top-[30%] right-[10%] w-[500px] h-[500px] bg-secondary/8 rounded-full blur-3xl animate-pulse-slow"
        style={{ animationDelay: "2.5s" }}
      />
      <div
        className="hidden md:block absolute bottom-[25%] left-[25%] w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse-slow"
        style={{ animationDelay: "1.2s" }}
      />

      {/* Additional blur overlay at bottom edge for extra smoothness */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 bg-background/90 backdrop-blur-md pointer-events-none"
        style={{
          maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, transparent 100%)",
        }}
      />

      <div className="container mx-auto px-4 w-full relative z-10 -top-[3vh]">
        <div className="md:max-w-7xl max-w-full mx-auto text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl group font-bold leading-tight md:text-6xl lg:text-8xl">
              {t("title")}{" "}
              <span className="md:hidden">{t("titleHighlight")}</span>
              <span className="hidden md:inline">
                <BrandText hoverable groupHover>
                  {t("titleHighlight")}
                </BrandText>
              </span>
            </h1>

            <p className="hidden text-lg text-muted-foreground font-medium md:block md:text-2xl lg:text-3xl">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 md:pt-1">
            <Button asChild size="lg">
              <Link href="/contact">
                {t("ctaPrimary")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/brands">{t("ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 animate-bounce">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ChevronDown className="w-5 h-5" />
        </div>
      </div>

      {/* Section divider at bottom */}
      {/* <div className="absolute bottom-0 left-0 right-0 z-10">
                <SectionDivider variant="dots" opacity={0.3} />
            </div> */}
    </section>
  );
};
