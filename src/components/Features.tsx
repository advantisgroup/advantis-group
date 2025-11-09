import { TrendingUp, Zap, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { BrandText } from "./BrandText";
import { cn } from "@/lib/utils";

export const Features = () => {
    const features = [
        {
            icon: TrendingUp,
            title: "Wir machen Ihre Salesmitarbeiter und Marken erfolgreich",
            desc: "Durch gezielte Strategien und praxisnahe Unterstützung helfen wir Ihren Teams, ihre Ziele zu erreichen und nachhaltig zu wachsen.",
        },
        {
            icon: Zap,
            title: "Wir gestalten Ihren Vertrieb smarter, schneller und effektiver",
            desc: "Mit modernen Tools und bewährten Methoden optimieren wir Ihre Vertriebsprozesse für maximale Effizienz und messbare Ergebnisse.",
        },
        {
            icon: Target,
            title: "Wir liefern nachhaltige Ergebnisse durch Erfahrung, Innovation und Leidenschaft",
            desc: "Über 15 Jahre Erfahrung gepaart mit innovativen Ansätzen für langfristigen Erfolg, der überzeugt.",
        },
    ];

    return (
        <section className="container mx-auto px-4 py-24">
            <div className="max-w-6xl mx-auto space-y-16">
                <div className="text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-bold">
                        Warum <BrandText brand="advantis">Advantis Group</BrandText>?
                    </h2>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Wir kombinieren Erfahrung, Innovation und Leidenschaft für nachhaltige Ergebnisse
                    </p>
                </div>
                
                <div className="border border-foreground/20 rounded-lg overflow-hidden">
                    <div className="grid md:grid-cols-3">
                        {features.map((f, i) => {
                            const Icon = f.icon;
                            const isNotFirst = i > 0;
                            return (
                                <Card key={i} className={cn("border-0 rounded-none bg-card", isNotFirst && "md:border-l border-foreground/20")}>
                                    <CardHeader>
                                        <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                                            <Icon className="w-6 h-6 text-primary" />
                                        </div>
                                        <CardTitle className="text-xl">{f.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <CardDescription className="text-base text-muted">{f.desc}</CardDescription>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};
