import { Header } from "@/components/Header";
import { TrendingUp, Zap, BookOpen, Brain, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandText } from "@/components/BrandText";

export default function UnsereMarken() {
  const brands = [
    {
      icon: TrendingUp,
      name: "Salespirates",
      brand: "salespirates" as const,
      description:
        "Ihre externe Vertriebsagentur für den Inbound- oder Outboundsales. Wir liefern Leads oder unterstützen Ihren Vertrieb – aktiv, zielgerichtet und mit messbaren Ergebnissen.",
      url: "https://salespirates.de",
    },
    {
      icon: Zap,
      name: "Rodeo-Consulting",
      brand: "rodeo" as const,
      description:
        "Sales ist Wild West und mit Rodeo kennen wir uns aus! Wir liefern Ihnen eine strategische Sales-Beratung, die Ihren Vertrieb neu ausrichtet, absolut skalierbar macht und mit Effizienz zum Wachstum führt.",
      url: "https://rodeoconsulting.de",
    },
    {
      icon: BookOpen,
      name: "Oldschool-train",
      brand: "salespirates" as const,
      description:
        "Die Welt braucht keinen neuen Sales Schnick-Schnack. Wir bringen Ihre Sales Teams mit authentischen Sales-Coachings to the Max! Das Zauberwort hier ist Nachhaltigkeit. Sie können 1000 Sales Coachings buchen, ohne im daily Business jemals erfolgreich damit zu sein – wir haben das eine Training, dass Sie und Ihr Team wirklich weiterbringt. Erfahrung, Empathie und echte Praxis treffen bei uns auf moderne Lernmethoden.",
      url: "https://oldschool-train.de",
    },
    {
      icon: Brain,
      name: "Sales-AI-Germany",
      brand: "salespirates" as const,
      description:
        "Alle sprechen über KI Tools. Wir beraten Sie, welche KI-Tools für Sales-Teams aktuell Sinn machen und einen echten Mehrwert bringen. Wir zeigen Ihnen, wie KI Technologie Ihren Vertrieb tatsächlich smarter macht.",
      url: "https://sales-ai-germany.de",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">
            Unsere Marken
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Vier starke Marken, ein gemeinsames Ziel: Ihr Vertriebserfolg
          </p>
        </section>

        <section className="max-w-6xl mx-auto">
          <div className="border border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {brands.map((brand, index) => {
                const Icon = brand.icon;
                return (
                  <Card key={index} className="border-0 rounded-none">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-2xl">
                        <BrandText brand={brand.brand}>{brand.name}</BrandText>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <CardDescription className="text-base">{brand.description}</CardDescription>
                      <Link
                        href={brand.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Mehr erfahren
                        <ArrowRight className="w-4 h-4" />
                      </Link>
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
