"use client";

import { ArrowRight, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { Button } from "../../ui/button";

export const HomeCTA = () => {
  const t = useTranslations("cta");

  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Background with smooth blend */}
      <div className="absolute inset-0 bg-linear-to-b from-primary/10 via-background/95 to-background" />
      <div className="absolute inset-0 dot-pattern opacity-20" />

      {/* Extended top blend from previous section for smooth transition */}
      <div className="absolute top-0 left-0 right-0 h-44 bg-linear-to-b from-primary/12 via-primary/8 to-transparent pointer-events-none" />

      {/* Floating orbs - hidden on mobile to prevent overflow */}
      <div className="hidden md:block absolute top-1/4 left-[10%] w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />
      <div
        className="hidden md:block absolute bottom-1/4 right-[10%] w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse-slow"
        style={{ animationDelay: "1.5s" }}
      />

      <div className="container mx-auto px-3 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-10">
          <div>
            <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
              {t("title")}{" "}
              <span className="bg-linear-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                {t("titleHighlight")}
              </span>
            </h2>
          </div>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="group shadow-2xl shadow-primary/20 hover:shadow-primary/30 hover:scale-105 transition-all duration-300 px-8 py-7 text-lg"
            >
              <Link href="/contact">
                {t("primary")}
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="px-8 py-7 text-lg">
              <Link href={`mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`}>
                <Mail className="w-5 h-5 mr-2" />
                {t("secondary")}
              </Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{t("benefits")}</p>
        </div>
      </div>
    </section>
  );
};
