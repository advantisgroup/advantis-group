'use client'

import { TrendingUp, Zap, BookOpen, Brain, ArrowRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandText } from '@/components/BrandText'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function UnsereMarken() {
    const [hoveredCard, setHoveredCard] = useState<number | null>(null)

    const brands = [
        {
            icon: TrendingUp,
            name: 'Salespirates',
            brand: 'salespirates' as const,
            tagline: 'Ihre externe Vertriebsagentur',
            description:
                'Ihre externe Vertriebsagentur für den Inbound- oder Outboundsales. Wir liefern Leads oder unterstützen Ihren Vertrieb – aktiv, zielgerichtet und mit messbaren Ergebnissen.',
            highlights: ['Lead-Generierung & Qualifizierung', 'Inbound & Outbound Sales', 'Messbare Performance'],
            url: 'https://salespirates.de',
        },
        {
            icon: Zap,
            name: 'Rodeo-Consulting',
            brand: 'rodeo' as const,
            tagline: 'Strategische Sales-Beratung',
            description:
                'Sales ist Wild West und mit Rodeo kennen wir uns aus! Wir liefern Ihnen eine strategische Sales-Beratung, die Ihren Vertrieb neu ausrichtet, absolut skalierbar macht und mit Effizienz zum Wachstum führt.',
            highlights: ['Strategische Neuausrichtung', 'Skalierbare Prozesse', 'Wachstumsorientiert'],
            url: 'https://rodeoconsulting.de',
        },
        {
            icon: BookOpen,
            name: 'Oldschool-train',
            brand: 'oldschool-train' as const,
            tagline: 'Authentische Sales-Trainings',
            description:
                'Die Welt braucht keinen neuen Sales Schnick-Schnack. Wir bringen Ihre Sales Teams mit authentischen Sales-Coachings to the Max! Das Zauberwort hier ist Nachhaltigkeit. Sie können 1000 Sales Coachings buchen, ohne im daily Business jemals erfolgreich damit zu sein – wir haben das eine Training, dass Sie und Ihr Team wirklich weiterbringt. Erfahrung, Empathie und echte Praxis treffen bei uns auf moderne Lernmethoden.',
            highlights: ['Nachhaltige Trainings', 'Praxisorientiert', 'Moderne Lernmethoden'],
            url: 'https://oldschool-train.de',
        },
        {
            icon: Brain,
            name: 'Sales-AI-Germany',
            brand: 'sales-ai-germany' as const,
            tagline: 'KI für intelligenten Vertrieb',
            description:
                'Alle sprechen über KI Tools. Wir beraten Sie, welche KI-Tools für Sales-Teams aktuell Sinn machen und einen echten Mehrwert bringen. Wir zeigen Ihnen, wie KI Technologie Ihren Vertrieb tatsächlich smarter macht.',
            highlights: ['KI-Tool Beratung', 'Praktische Integration', 'Echter Mehrwert'],
            url: 'https://sales-ai-germany.de',
        },
    ]

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 pt-32 pb-24 space-y-24">
                {/* Hero Section */}
                <section className="max-w-4xl mx-auto space-y-8 text-center">
                    <div className="inline-block">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                            <Zap className="w-4 h-4" />
                            Vier starke Marken
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
                        Unsere <span className="text-primary">Marken</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Ein gemeinsames Ziel: Ihr nachhaltiger Vertriebserfolg
                    </p>
                </section>

                {/* Brands Grid */}
                <section className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                        {brands.map((brand, index) => {
                            const isHovered = hoveredCard === index
                            const hasHoveredCard = hoveredCard !== null

                            return (
                                <Card
                                    key={index}
                                    className={cn(
                                        'group relative overflow-hidden transition-all duration-300 cursor-pointer border border-foreground/20',
                                        isHovered &&
                                            'border-primary shadow-xl shadow-primary/20 scale-[1.02] border-2 z-10 rounded-sm',
                                        hasHoveredCard && !isHovered && 'opacity-50 scale-[0.98]',
                                        !hasHoveredCard && 'hover:border-primary/50'
                                    )}
                                    onMouseEnter={() => setHoveredCard(index)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                >
                                    {/* Background gradient effect */}
                                    <div
                                        className={cn(
                                            'absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300',
                                            isHovered && 'opacity-100'
                                        )}
                                    />

                                    <CardHeader className="relative">
                                        <div className="flex items-start gap-4">
                                            <div className="space-y-2 flex-1">
                                                <div className="text-sm text-primary font-medium">{brand.tagline}</div>
                                                <CardTitle className="text-3xl">
                                                    <BrandText brand={brand.brand}>{brand.name}</BrandText>
                                                </CardTitle>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="relative space-y-6">
                                        <CardDescription className="text-base leading-relaxed">
                                            {brand.description}
                                        </CardDescription>

                                        {/* Highlights */}
                                        <div className="space-y-2">
                                            {brand.highlights.map((highlight, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        'flex items-center gap-2 text-sm text-muted-foreground transition-all duration-300',
                                                        isHovered && 'translate-x-1'
                                                    )}
                                                    style={{ transitionDelay: `${idx * 50}ms` }}
                                                >
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                    {highlight}
                                                </div>
                                            ))}
                                        </div>

                                        {/* CTA Link */}
                                        <Button asChild variant={'ghost'}>
                                            <Link
                                                href={brand.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={cn(
                                                    'inline-flex items-center gap-2 text-sm font-medium text-primary hover:gap-3 transition-all duration-300 group/link pt-2',
                                                    isHovered && 'gap-3'
                                                )}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <span>Mehr erfahren</span>
                                                <ExternalLink className="w-3 h-3 opacity-50" />
                                            </Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </section>

                {/* Bottom CTA Section */}
                <section className="max-w-4xl mx-auto text-center space-y-6 pt-12">
                    <div className="p-8 rounded-2xl bg-linear-to-br from-background/10 via-primary/5 to-transparent border border-primary/20">
                        <h2 className="text-2xl md:text-3xl font-bold mb-4">Welche Marke passt zu Ihnen?</h2>
                        <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                            Lassen Sie uns gemeinsam herausfinden, wie wir Ihren Vertrieb auf das nächste Level bringen
                            können.
                        </p>
                        <Link
                            href="/kontakt"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            Jetzt Kontakt aufnehmen
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    )
}
