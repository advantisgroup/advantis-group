'use client'

import Link from 'next/link'

import { ArrowRight } from 'lucide-react'

import { BrandText } from '@/components/effects/BrandText'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HomeBrandsProps {
    isVisible: boolean
}

export const HomeBrands = ({ isVisible }: HomeBrandsProps) => {
    const brands = [
        {
            name: 'Salespirates',
            brand: 'salespirates' as const,
            tagline: 'Externe Vertriebsagentur',
            description:
                'Wir liefern Leads oder unterstützen Ihren Vertrieb mit messbaren Ergebnissen. Aktiv, zielgerichtet und effektiv.',
            brandColor: 'text-salespirates',
        },
        {
            name: 'Rodeo-Consulting',
            brand: 'rodeo' as const,
            tagline: 'Strategische Beratung',
            description:
                'Sales ist Wild West. Wir richten Ihren Vertrieb neu aus, machen ihn skalierbar und führen mit Effizienz zum Wachstum.',
            brandColor: 'text-rodeo',
        },
        {
            name: 'Oldschool-train',
            brand: 'oldschool-train' as const,
            tagline: 'Authentische Trainings',
            description:
                'Sales-Coachings die wirklich weiterbringen. Erfahrung, Empathie und echte Praxis treffen auf moderne Lernmethoden.',
            brandColor: 'text-oldschool',
        },
        {
            name: 'Sales-AI-Germany',
            brand: 'sales-ai-germany' as const,
            tagline: 'KI für den Vertrieb',
            description:
                'Wir zeigen, welche KI-Tools für Sales wirklich Sinn machen und wie Sie Ihren Vertrieb smarter gestalten.',
            brandColor: 'text-sales-ai',
        },
    ]

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Background with blend */}
            <div className="absolute inset-0 bg-linear-to-b from-background/50 via-primary/5 to-background" />
            <div className="absolute inset-0 grid-pattern opacity-10" />

            {/* Top blend from previous section */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-background to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-7xl mx-auto space-y-20">
                    {/* Header */}
                    <div
                        className={cn(
                            'text-center space-y-6 opacity-0 -translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                    >
                        <h2 className="text-5xl md:text-7xl font-bold tracking-tight">
                            Unsere <span className="text-primary">Marken</span>
                        </h2>
                        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
                            Vier starke Marken, ein gemeinsames Ziel: Ihr Vertriebserfolg
                        </p>
                    </div>

                    {/* Brand Grid */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {brands.map((brand, idx) => {
                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'opacity-0 translate-y-12 transition-all duration-1000',
                                        isVisible && 'opacity-100 translate-y-0'
                                    )}
                                    style={{ transitionDelay: `${200 + idx * 100}ms` }}
                                >
                                    <Link href={`/unsere-marken#${brand.brand}`}>
                                        <div className="group relative p-8 rounded-2xl bg-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10 h-full">
                                            {/* Icon */}
                                            <div className="flex items-start gap-4 mb-6">
                                                <div className="flex-1">
                                                    <div className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                                                        {brand.tagline}
                                                    </div>
                                                    <h3 className="text-3xl font-bold">
                                                        <BrandText brand={brand.brand} hoverable={false}>
                                                            {brand.name}
                                                        </BrandText>
                                                    </h3>
                                                </div>

                                                <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                            </div>

                                            {/* Description */}
                                            <p className="text-base text-muted-foreground leading-relaxed">
                                                {brand.description}
                                            </p>
                                        </div>
                                    </Link>
                                </div>
                            )
                        })}
                    </div>

                    {/* CTA to brands */}
                    <div
                        className={cn(
                            'text-center opacity-0 translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                        style={{ transitionDelay: '600ms' }}
                    >
                        <Button asChild size="lg" variant="outline" className="group">
                            <Link href="/unsere-marken">
                                Alle Marken entdecken
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Bottom blend to next section */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-b from-transparent to-background pointer-events-none" />
        </section>
    )
}
