'use client'

import Image from 'next/image'
import Link from 'next/link'

import { Target, Zap, Heart, ArrowRight, TrendingUp, Users, Award } from 'lucide-react'

import { BrandText } from '@/components/effects/BrandText'
import GradientBackground from '@/components/effects/GradientBackground'
import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { SectionDivider } from '@/components/layout/SectionDivider'
import { Button } from '@/components/ui/button'
import { useBrandLogo } from '@/hooks/use-logo'

export default function UberUns() {
    const logo = useBrandLogo()
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

    const stats = [
        {
            icon: TrendingUp,
            value: '15+',
            label: 'Jahre Erfahrung',
        },
        {
            icon: Users,
            value: '500+',
            label: 'Erfolgreiche Projekte',
        },
        {
            icon: Award,
            value: '4',
            label: 'Starke Marken',
        },
    ]

    return (
        <div className="min-h-screen relative overflow-hidden bg-background">
            {/* Global Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-background/90 backdrop-blur-[1px] z-10" />
                <GradientBackground className="opacity-20" />
                <div className="absolute inset-0 noise-texture opacity-20 z-20" />
            </div>

            <main className="relative z-30">
                {/* Hero Section */}
                <section className="relative pt-32 pb-20 md:pt-40 md:pb-32">
                    <div className="container mx-auto px-4 md:px-6 max-w-6xl">
                        <ScrollReveal>
                            <div className="max-w-4xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
                                    Über uns
                                </div>
                                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
                                    Ihre Heimat für <br />
                                    exzellenten Vertrieb
                                </h1>
                                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl">
                                    Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> vereint über 15
                                    Jahre Vertriebserfahrung unter einem Dach – mit Leidenschaft, Pragmatismus und einem
                                    klaren Fokus auf Erfolg.
                                </p>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                <SectionDivider variant="dots" opacity={0.3} className="mb-20" />

                <div className="container mx-auto px-4 md:px-6 max-w-6xl pb-32">
                    {/* Mission & Vision */}
                    <ScrollReveal delay={100}>
                        <section className="mb-32">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl p-8 md:p-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-6">
                                        Mission
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                                        Vertrieb als Handwerk und Haltung
                                    </h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        Wir verstehen Vertrieb nicht als Zufall, sondern als Handwerk. Unser Anspruch:
                                        nachhaltige, effektive und praxisnahe Lösungen, die funktionieren.
                                    </p>
                                </div>

                                <div className="bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl p-8 md:p-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-6">
                                        Vision
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                                        Familiär, professionell, ehrlich
                                    </h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        Dabei sind wir familiär im Umgang, professionell in der Umsetzung und ehrlich im
                                        Ergebnis – für langfristige Partnerschaften, die Vertrauen schaffen.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Story Section */}
                    <ScrollReveal delay={200}>
                        <section className="mb-32">
                            <div className="grid md:grid-cols-12 gap-12 md:gap-16">
                                <div className="md:col-span-4">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                        Unsere Geschichte
                                    </h2>
                                    <div className="w-12 h-1 bg-primary rounded-full" />
                                </div>
                                <div className="md:col-span-8 space-y-6">
                                    <p className="text-lg leading-relaxed">
                                        Die <BrandText brand="advantis">Advantis-Group GmbH</BrandText> wurde 2025 von{' '}
                                        <span className="font-semibold">Andrea Reichl</span> gegründet und vereint über
                                        15 Jahre Vertriebserfahrung in unterschiedlichen Branchen unter einem Dach.
                                    </p>

                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        Was vor Jahren als Einzelunternehmen begann, ist nun eine Unternehmensgruppe mit
                                        starken Marken und einem gemeinsamen Focus: 100 % Sales.
                                    </p>

                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        Schnick-schnack liegt uns nicht – wir haben das Rad nicht neu erfunden, nur ein
                                        paar schicke Felgen aufgezogen. Pragmatisch, effektiv, nachhaltig.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Stats */}
                    <ScrollReveal delay={100}>
                        <section className="mb-32">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {stats.map((stat, _index) => {
                                    const Icon = stat.icon
                                    return (
                                        <div
                                            key={stat.label}
                                            className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl p-8 text-center group hover:border-primary/30 transition-all duration-300"
                                        >
                                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                                                <Icon className="w-7 h-7 text-primary" />
                                            </div>
                                            <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                                            <div className="text-sm text-muted-foreground font-medium">
                                                {stat.label}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Values */}
                    <ScrollReveal delay={200}>
                        <section className="mb-32">
                            <div className="mb-12">
                                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Unsere Werte
                                </h2>
                                <div className="w-12 h-1 bg-primary rounded-full" />
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                {values.map((value, _index) => {
                                    const Icon = value.icon
                                    return (
                                        <div
                                            key={value.title}
                                            className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl p-8 group hover:border-primary/30 hover:-translate-y-1 transition-all duration-300"
                                        >
                                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-background/50 mb-6 group-hover:bg-primary/10 transition-colors">
                                                <Icon
                                                    className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors"
                                                    strokeWidth={1.5}
                                                />
                                            </div>
                                            <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                                            <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Logo Section */}
                    <ScrollReveal delay={150}>
                        <section className="">
                            <div className="flex justify-center">
                                <div className="relative w-full max-w-sm md:max-w-2xl lg:max-w-4xl px-4">
                                    <Image
                                        src={logo}
                                        alt="Advantis Group - All About Sales"
                                        width={3125}
                                        height={1875}
                                        className="w-full h-auto"
                                        priority={false}
                                    />
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* CTA Section */}
                    <ScrollReveal delay={100}>
                        <section className="border-t border-border/50 pt-16">
                            <div className="max-w-3xl">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                    Bereit für den nächsten Schritt?
                                </h2>
                                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                                    Lassen Sie uns gemeinsam an Ihrem Vertriebserfolg arbeiten. Ob Unterstützung im
                                    aktiven Vertrieb, strategische Beratung oder moderne KI-Lösungen – wir helfen Ihnen
                                    dabei.
                                </p>
                                <Button asChild size="lg">
                                    <Link href="/kontakt" className="inline-flex items-center gap-2 group">
                                        <span>Kontakt aufnehmen</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                            </div>
                        </section>
                    </ScrollReveal>
                </div>
            </main>
        </div>
    )
}
