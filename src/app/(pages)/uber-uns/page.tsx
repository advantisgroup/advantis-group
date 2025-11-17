import { Header } from "@/components/Header";
import { Target, Zap, Heart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandText } from "@/components/BrandText";
import Image from "next/image";

export default function UberUns() {
  const values = [
    {
      icon: Target,
      title: "Erfahrung",
      description: "Über 15 Jahre Vertriebserfahrung in unterschiedlichen Branchen",
    },
    {
      icon: Zap,
      title: "Innovation",
      description: "Moderne Tools und bewährte Methoden für maximale Effizienz",
    },
    {
      icon: Heart,
      title: "Leidenschaft",
      description: "Nachhaltige Ergebnisse durch Engagement und Expertise",
    },
  ];

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">
            Über uns
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> – Ihre Heimat für exzellenten Vertrieb
          </p>
        </section>

        <section className="max-w-6xl mx-auto space-y-12">
          <Card className="border border-border rounded-t-lg">
            <CardHeader>
              <CardTitle className="text-2xl">
                Unsere Geschichte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-lg leading-relaxed">
                Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> wurde 2025 von{" "}
                <span className="font-semibold">Andrea Reichl</span> gegründet und vereint über 15 Jahre
                Vertriebserfahrung in unterschiedlichen Branchen unter einem Dach.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Was vor Jahren Einzelunternehmen begann, ist nun eine Unternehmensgruppe mit starken Marken und einem gemeinsamen Focus: 100 % Sales.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Wir verstehen Vertrieb nicht als Zufall, sondern als Handwerk – und als Haltung.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Unser Anspruch: nachhaltige, effektive und praxisnahe Lösungen, die funktionieren. Schnick-schnack liegt uns nicht – wir haben das Rad nicht neu erfunden, nur ein paar schicke Felgen aufgezogen.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Dabei sind wir familiär im Umgang, professionell in der Umsetzung und ehrlich im Ergebnis.
              </p>
            </CardContent>
          </Card>

          <div className="border border-border rounded-b-lg">
            <div className="grid md:grid-cols-3 divide-x divide-border">
              {values.map((value) => {
                const Icon = value.icon;
                return (
                  <Card key={value.title} className="border-0 rounded-none">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{value.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base">{value.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
