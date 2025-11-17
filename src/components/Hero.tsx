"use client"

import { ArrowRight } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { BrandText } from "./BrandText";
import { Button } from "./ui/button";
import GradientBackground from "./lightswind/gradient-background";
import posthog from "posthog-js";
import { useIsMobile } from "@/hooks/use-mobile";

export const Hero = () => {
  const isMobile = useIsMobile()
  return (
    <section className="relative h-screen flex items-center">
      {/* Gradient Background */}
      <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden">
        <GradientBackground
          backdropBlurAmount="lg"
          className="h-full w-full opacity-50"
        />

        {/* Smooth fade-out at bottom for seamless transition - creates soft blur effect */}
        <div className="absolute bottom-0 left-0 right-0 h-50 bg-linear-to-b from-transparent via-background/40 to-background pointer-events-none" />
      </div>
      {/* Additional blur overlay at bottom edge for extra smoothness */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-background/80 backdrop-blur-sm pointer-events-none"
        style={{
          maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
        }}
      />

      <div className="container mx-auto px-4 w-full relative z-10 -top-[10vh]">
        <div className="md:max-w-7xl max-w-full mx-auto text-center space-y-6">
          <div className="space-y-2">
            <div className="inline-flex group items-center gap-2 px-3 py-1 rounded-full border border-border bg-background/50 text-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <BrandText brand="advantis" hoverable keepRestColor groupHover className="group-hover:text-shadow-xs text-shadow-black/30 duration-300">
                Advantis Group
              </BrandText>
            </div>

            {isMobile ?
              <h1 className="font-bold">
                <span className="text-3xl">Mehr als ein Unternehmen</span> <br /> <span className="text-4xl">komplette Sales Power</span>
              </h1>
              :
              <h1 className="text-4xl md:text-8xl font-bold leading-tight">
                Mehr als ein Unternehmen, komplette Sales Power
              </h1>
            }

            {!isMobile &&
              <p className="text-lg md:text-3xl text-muted-foreground font-medium">
                Wir bringen Ihren Vertrieb auf das nächste Level!
              </p>}
          </div>


          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 md:pt-1">
            <Button asChild size="lg">
              <Link href="/kontakt">
                Jetzt Kontakt aufnehmen
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg">
              <Link href="/unsere-marken">
                Unsere Marken entdecken
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
