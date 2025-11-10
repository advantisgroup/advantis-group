"use client"

import { TrendingUp, Zap, Target, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { BrandText } from "./BrandText";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export const Features = () => {
    const isMobile = useIsMobile();
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    
    const features = [
        {
            icon: TrendingUp,
            title: "Wir machen Ihre Salesmitarbeiter und Marken erfolgreich",
            desc: "Durch gezielte Strategien und praxisnahe Unterstützung helfen wir Ihren Teams, ihre Ziele zu erreichen und nachhaltig zu wachsen.",
            details: [
                "Individuelle Trainings und Workshops für Ihr Sales-Team",
                "Praxiserprobte Verkaufsstrategien und -methoden",
                "Kontinuierliche Begleitung und Performance-Optimierung",
                "Messbare Steigerung der Abschlussquoten"
            ]
        },
        {
            icon: Zap,
            title: "Wir gestalten Ihren Vertrieb smarter, schneller und effektiver",
            desc: "Mit modernen Tools und bewährten Methoden optimieren wir Ihre Vertriebsprozesse für maximale Effizienz und messbare Ergebnisse.",
            details: [
                "Digitalisierung und Automatisierung von Vertriebsprozessen",
                "CRM-Optimierung und Sales-Tech-Integration",
                "Datengetriebene Entscheidungsfindung",
                "Reduzierung von Reibungsverlusten im Sales-Funnel"
            ]
        },
        {
            icon: Target,
            title: "Wir liefern nachhaltige Ergebnisse durch Erfahrung, Innovation und Leidenschaft",
            desc: "Über 15 Jahre Erfahrung gepaart mit innovativen Ansätzen für langfristigen Erfolg, der überzeugt.",
            details: [
                "15+ Jahre Expertise im B2B- und B2C-Vertrieb",
                "Innovative Ansätze kombiniert mit bewährten Methoden",
                "Langfristige Partnerschaften statt kurzfristiger Projekte",
                "ROI-fokussierte Strategien mit nachweisbaren Ergebnissen"
            ]
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
                
                <div className="relative border border-foreground/20 rounded-lg overflow-visible">
                    <div className="grid md:grid-cols-3">
                        {features.map((f, i) => {
                            const Icon = f.icon;
                            const isNotFirst = i > 0;
                            const isFirst = i === 0;
                            const isLast = i === features.length - 1;
                            const isExpanded = expandedCard === i;
                            
                            return (
                                <div 
                                    key={i} 
                                    className="relative"
                                    onMouseEnter={() => !isMobile && setExpandedCard(i)}
                                    onMouseLeave={() => !isMobile && setExpandedCard(null)}
                                    onClick={() => isMobile && setExpandedCard(isExpanded ? null : i)}
                                >
                                    <Card className={cn(
                                        "border-0 rounded-none bg-card transition-all duration-300 h-full cursor-pointer relative",
                                        isNotFirst && "md:border-l border-foreground/20",
                                        isExpanded && "z-50"
                                    )}>
                                        <CardHeader>
                                            <div className={cn(
                                                "w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4 transition-all duration-300",
                                                isExpanded && "bg-primary/20 scale-110"
                                            )}>
                                                <Icon className="w-6 h-6 text-primary" />
                                            </div>
                                            <CardTitle className="text-xl">{f.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <CardDescription className="text-base text-muted">{f.desc}</CardDescription>
                                        </CardContent>
                                    </Card>
                                    
                                    {/* Expanded content overlay - Desktop only */}
                                    {!isMobile && (
                                        <div className={cn(
                                            "absolute top-0 h-full bg-card border-2 border-primary/40 rounded-lg shadow-2xl transition-all duration-700 ease-out pointer-events-none z-50",
                                            // Smart positioning and animation: first card expands RIGHT, last card expands LEFT, middle expands BOTH
                                            isFirst && "left-0",
                                            isLast && "right-0",
                                            !isFirst && !isLast && "left-1/2 -translate-x-1/2",
                                            // Animate width and opacity
                                            isExpanded ? "opacity-100 visible pointer-events-auto w-[200%]" : "opacity-0 invisible w-full"
                                        )}>
                                            <div className={cn(
                                                "p-6 h-full flex flex-col transition-opacity duration-300",
                                                isExpanded ? "opacity-100 delay-300" : "opacity-0"
                                            )}>
                                                <div className="flex items-start gap-4 mb-4">
                                                    <div className="w-14 h-14 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
                                                        <Icon className="w-7 h-7 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                                                        <p className="text-sm text-muted-foreground">{f.desc}</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-4 pt-4 border-t border-foreground/10">
                                                    <h4 className="text-sm font-semibold mb-3 text-primary">Was wir bieten:</h4>
                                                    <ul className="space-y-2">
                                                        {f.details.map((detail, idx) => (
                                                            <li key={idx} className="flex items-start gap-2 text-sm">
                                                                <Plus className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                                                <span className="text-muted-foreground">{detail}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Expanded content - Mobile (below card) */}
                                    {isMobile && isExpanded && (
                                        <div className="mt-4 p-4 bg-card border border-primary/40 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                                            <h4 className="text-sm font-semibold mb-3 text-primary">Was wir bieten:</h4>
                                            <ul className="space-y-2">
                                                {f.details.map((detail, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-sm">
                                                        <Plus className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                                        <span className="text-muted-foreground">{detail}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};