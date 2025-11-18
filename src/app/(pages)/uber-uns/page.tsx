import { Target, Zap, Heart, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandText } from '@/components/BrandText'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function UberUns() {
    const values = [
        {
            icon: Target,
            title: 'Erfahrung',
            description: 'Über 15 Jahre Vertriebserfahrung in unterschiedlichen Branchen',
        },
        {
            icon: Zap,
            title: 'Innovation',
            description: 'Moderne Tools und bewährte Methoden für maximale Effizienz',
        },
        {
            icon: Heart,
            title: 'Leidenschaft',
            description: 'Nachhaltige Ergebnisse durch Engagement und Expertise',
        },
    ]

    return (
        <div className="min-h-screen">
            <main className="container mx-auto px-6 pt-32 pb-32 max-w-6xl">
                {/* Hero */}
                <section className="max-w-3xl mb-32">
                    <h1 className="text-7xl md:text-8xl font-medium tracking-tight mb-8">
                        Über uns
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> – Ihre Heimat für exzellenten Vertrieb
                    </p>
                </section>

                {/* Story Section */}
                <section className="mb-40">
                    <div className="grid md:grid-cols-12 gap-16">
                        <div className="md:col-span-4">
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                                Unsere Geschichte
                            </h2>
                        </div>
                        <div className="md:col-span-8 space-y-6 text-lg leading-relaxed">
                            <p>
                                Die <BrandText brand="advantis">Advantis-Group GmbH</BrandText> wurde 2025 von{' '}
                                <span className="font-medium">Andrea Reichl</span> gegründet und vereint über 15 Jahre
                                Vertriebserfahrung in unterschiedlichen Branchen unter einem Dach.
                            </p>

                            <p className="text-muted-foreground">
                                Was vor Jahren als Einzelunternehmen begann, ist nun eine Unternehmensgruppe mit starken
                                Marken und einem gemeinsamen Focus: 100 % Sales.
                            </p>

                            <p className="text-muted-foreground">
                                Wir verstehen Vertrieb nicht als Zufall, sondern als Handwerk – und als Haltung.
                            </p>

                            <p className="text-muted-foreground">
                                Unser Anspruch: nachhaltige, effektive und praxisnahe Lösungen, die funktionieren.
                                Schnick-schnack liegt uns nicht – wir haben das Rad nicht neu erfunden, nur ein paar
                                schicke Felgen aufgezogen.
                            </p>

                            <p className="text-muted-foreground">
                                Dabei sind wir familiär im Umgang, professionell in der Umsetzung und ehrlich im
                                Ergebnis.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Values Grid */}
                <section className="mb-40">
                    <div className="grid md:grid-cols-12 gap-16 mb-12">
                        <div className="md:col-span-4">
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Unsere Werte
                            </h2>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-px bg-border">
                        {values.map((value, index) => {
                            const Icon = value.icon
                            return (
                                <div key={value.title + "_" + index} className="bg-card p-12 group hover:bg-accent/5 transition-colors">
                                    <Icon className="w-8 h-8 mb-6 text-foreground/60" strokeWidth={1.5} />
                                    <h3 className="text-xl font-medium mb-4">{value.title}</h3>
                                    <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* CTA Section */}
                <section className="border-t border-border pt-20">
                    <div className="max-w-3xl">
                        <h2 className="text-3xl font-medium mb-6">
                            Bereit für den nächsten Schritt?
                        </h2>
                        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                            Lassen Sie uns gemeinsam an Ihrem Vertriebserfolg arbeiten. Ob Unterstützung im aktiven Vertrieb,
                            strategische Beratung oder moderne KI-Lösungen – wir helfen Ihnen dabei.
                        </p>
                        <Button asChild>
                            <Link
                                href="/kontakt"
                                className="inline-flex items-center gap-2 group"
                            >
                                <span className="font-medium">Kontakt aufnehmen</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    )
}