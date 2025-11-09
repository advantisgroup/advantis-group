import { TrendingUp, Zap, BookOpen, Brain } from "lucide-react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { BrandText } from "./BrandText";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const brands = [
  {
    icon: TrendingUp,
    name: "Salespirates",
    brand: "salespirates" as const,
    description:
      "Ihre externe Vertriebsagentur für den Inbound- oder Outboundsales. Wir liefern Leads oder unterstützen Ihren Vertrieb – aktiv, zielgerichtet und mit messbaren Ergebnissen.",
  },
  {
    icon: Zap,
    name: "Rodeo-Consulting",
    brand: "rodeo" as const,
    description:
      "Sales ist Wild West und mit Rodeo kennen wir uns aus! Wir liefern Ihnen eine strategische Sales-Beratung, die Ihren Vertrieb neu ausrichtet, absolut skalierbar macht und mit Effizienz zum Wachstum führt.",
  },
  {
    icon: BookOpen,
    name: "Oldschool-train",
    brand: "oldschool-train" as const,
    description:
      "Die Welt braucht keinen neuen Sales Schnick-Schnack. Wir bringen Ihre Sales Teams mit authentischen Sales-Coachings to the Max! Das Zauberwort hier ist Nachhaltigkeit. Sie können 1000 Sales Coachings buchen, ohne im daily Business jemals erfolgreich damit zu sein – wir haben das eine Training, dass Sie und Ihr Team wirklich weiterbringt. Erfahrung, Empathie und echte Praxis treffen bei uns auf moderne Lernmethoden.",
  },
  {
    icon: Brain,
    name: "Sales-AI-Germany",
    brand: "sales-ai-germany" as const,
    description:
      "Alle sprechen über KI Tools. Wir beraten Sie, welche KI-Tools für Sales-Teams aktuell Sinn machen und einen echten Mehrwert bringen. Wir zeigen Ihnen, wie KI Technologie Ihren Vertrieb tatsächlich smarter macht.",
  },
];

export const Services = () => {
  return (
    <section className="container mx-auto px-4 py-24">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl md:text-6xl font-bold">
            Unsere Marken
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Vier starke Marken, ein gemeinsames Ziel: Ihr Vertriebserfolg
          </p>
        </div>

        <div className="border border-foreground/20 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {brands.map((brand, index) => {
              const Icon = brand.icon;
              const isEven = index % 2 === 0;
              const isTopRow = index < 2;
              return (
                <Card 
                  key={index} 
                  className={cn(
                    "border-0 rounded-none bg-card",
                    !isTopRow && "border-t border-foreground/20",
                    !isEven && "md:border-l border-foreground/20"
                  )}
                >
                  <CardHeader>
                    <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">
                      <BrandText brand={brand.brand}>{brand.name}</BrandText>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">{brand.description}</CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="text-center">
          <Button asChild>
            <Link
              href="/unsere-marken"
            >
              Alle Marken entdecken
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
