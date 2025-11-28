'use client'

import { TrendingUp, Zap, Target } from 'lucide-react'

import { cn } from '@/lib/utils'

import { BrandText } from './BrandText'

interface HomeFeaturesProps {
    isVisible: boolean
}

export const HomeFeatures = ({ isVisible }: HomeFeaturesProps) => {
    const features = [
        {
            icon: TrendingUp,
            title: 'Sales-Teams erfolgreich machen',
            desc: 'Durch gezielte Strategien und praxisnahe Unterstützung helfen wir Ihren Teams, ihre Ziele zu erreichen und nachhaltig zu wachsen.',
        },
        {
            icon: Zap,
            title: 'Vertrieb smarter gestalten',
            desc: 'Mit modernen Tools und bewährten Methoden optimieren wir Ihre Vertriebsprozesse für maximale Effizienz.',
        },
        {
            icon: Target,
            title: 'Nachhaltige Ergebnisse liefern',
            desc: 'Über 15 Jahre Erfahrung gepaart mit innovativen Ansätzen für langfristigen Erfolg, der überzeugt.',
        },
    ]

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Background with smooth blend */}
            <div className="absolute inset-0 bg-linear-to-b from-background via-background to-transparent" />
            <div className="absolute inset-0 dot-pattern opacity-20" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-6xl mx-auto space-y-16">
                    {/* Header */}
                    <div
                        className={cn(
                            'text-center space-y-4 opacity-0 -translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                    >
                        <h2 className="text-4xl md:text-6xl font-bold">
                            Warum <BrandText brand="advantis">Advantis Group</BrandText>?
                        </h2>
                        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                            Wir kombinieren Erfahrung, Innovation und Leidenschaft
                        </p>
                    </div>

                    {/* Feature Cards */}
                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, idx) => {
                            const Icon = feature.icon

                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'opacity-0 translate-y-12 transition-all duration-1000',
                                        isVisible && 'opacity-100 translate-y-0'
                                    )}
                                    style={{ transitionDelay: `${200 + idx * 150}ms` }}
                                >
                                    <div className="group relative h-full p-8 rounded-2xl bg-card/40 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-primary/10">
                                        {/* Glow effect */}
                                        <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />

                                        <div className="relative space-y-4">
                                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                                                <Icon className="w-8 h-8 text-primary" />
                                            </div>
                                            <h3 className="text-2xl font-bold leading-tight">{feature.title}</h3>
                                            <p className="text-base text-muted-foreground leading-relaxed">
                                                {feature.desc}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom blend to next section */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-b from-transparent to-background/50 pointer-events-none" />
        </section>
    )
}
