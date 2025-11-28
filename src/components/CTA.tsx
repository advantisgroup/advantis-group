'use client'

import Link from 'next/link'

import { ArrowRight, Mail } from 'lucide-react'

import { BrandText } from './BrandText'
import { ScrollReveal } from './ScrollReveal'
import { Button } from './ui/button'

export const CTA = () => {
    return (
        <section className="relative py-32 overflow-hidden">
            {/* Background with gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-background to-secondary/5" />
            <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />

            <div className="container mx-auto px-4 relative">
                <div className="max-w-4xl mx-auto text-center space-y-8">
                    <ScrollReveal>
                        <h2 className="text-5xl md:text-6xl font-bold tracking-tight">
                            Bereit, Ihren Vertrieb auf das nächste Level zu bringen?
                        </h2>
                    </ScrollReveal>

                    <ScrollReveal delay={100}>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            Lassen Sie uns gemeinsam herausfinden, wie{' '}
                            <BrandText brand="advantis">Advantis Group</BrandText> Ihren Vertrieb transformieren kann.
                        </p>
                    </ScrollReveal>

                    <ScrollReveal delay={200}>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Button asChild size="lg" className="group text-lg px-8 py-6">
                                <Link href="/kontakt">
                                    Jetzt Kontakt aufnehmen
                                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </Button>
                            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6">
                                <Link href="mailto:touch@advantis-group.de">
                                    <Mail className="w-5 h-5 mr-2" />
                                    E-Mail schreiben
                                </Link>
                            </Button>
                        </div>
                    </ScrollReveal>

                    <ScrollReveal delay={300}>
                        <p className="text-sm text-muted-foreground">
                            Kostenlose Erstberatung • Keine Verpflichtungen • Individuelle Lösungen
                        </p>
                    </ScrollReveal>
                </div>
            </div>
        </section>
    )
}
