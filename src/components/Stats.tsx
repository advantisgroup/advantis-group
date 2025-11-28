'use client'

import { TrendingUp, Users, Zap } from 'lucide-react'

import { ScrollReveal } from './ScrollReveal'

export const Stats = () => {
    const stats = [
        {
            icon: TrendingUp,
            value: '15+',
            label: 'Jahre Erfahrung',
            description: 'im B2B- und B2C-Vertrieb',
        },
        {
            icon: Users,
            value: '500+',
            label: 'Erfolgreiche Projekte',
            description: 'mit zufriedenen Kunden',
        },
        {
            icon: Zap,
            value: '4',
            label: 'Starke Marken',
            description: 'unter einem Dach',
        },
    ]

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Subtle background */}
            <div className="absolute inset-0" />
            <div className="absolute inset-0 noise-texture opacity-20 pointer-events-none" />

            <div className="container mx-auto px-4 relative">
                <div className="max-w-6xl mx-auto">
                    <ScrollReveal className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4">Zahlen, die für sich sprechen</h2>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                            Unsere Erfahrung und Expertise in Zahlen
                        </p>
                    </ScrollReveal>

                    <div className="grid md:grid-cols-3 gap-8">
                        {stats.map((stat, index) => {
                            const Icon = stat.icon
                            return (
                                <ScrollReveal key={index} delay={index * 100}>
                                    <div className="text-center space-y-4 p-8 rounded-lg bg-card/50 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 hover:scale-105">
                                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                                            <Icon className="w-8 h-8 text-primary" />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-5xl font-bold text-primary">{stat.value}</div>
                                            <div className="text-xl font-semibold">{stat.label}</div>
                                            <div className="text-sm text-muted-foreground">{stat.description}</div>
                                        </div>
                                    </div>
                                </ScrollReveal>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}
