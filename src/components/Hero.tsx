import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BrandText } from "./BrandText";
import { Button } from "./ui/button";
import GradientBackground from "./lightswind/gradient-background";

export const Hero = () => {
  return (
    <section className="relative h-screen flex items-center">
      {/* Gradient Background */}
      <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden">
        <GradientBackground
          backdropBlurAmount="lg"
          className="h-full w-full opacity-50"
        />
        {/* Brand color overlay gradient - subtle blend of brand colors */}
        <div className="absolute inset-0 bg-linear-to-br from-brand-advantis/30 via-transparent to-brand-rodeo/20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-linear-to-t from-background/40 via-transparent to-transparent" />
        {/* Smooth fade-out at bottom for seamless transition - creates soft blur effect */}
        <div className="absolute bottom-0 left-0 right-0 h-80 bg-linear-to-b from-transparent via-background/40 to-background pointer-events-none" />
      </div>
      {/* Additional blur overlay at bottom edge for extra smoothness */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-background/80 backdrop-blur-sm pointer-events-none"
        style={{
          maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
        }}
      />

      <div className="container mx-auto px-4 w-full relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-2">
            <h1 className="text-6xl md:text-8xl font-bold leading-tight">
              <BrandText brand="advantis" hoverable keepRestColor className="hover:text-shadow-xs text-shadow-white/30 duration-300">
                Advantis Group
              </BrandText>
            </h1>

            <p className="text-2xl md:text-3xl text-muted-foreground font-medium">
              Wir bringen Ihren Vertrieb auf das nächste Level!
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <p className="text-lg text-foreground/80">
              Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button asChild size="lg">
              <Link href="/kontakt">
                Jetzt Kontakt aufnehmen
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
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
