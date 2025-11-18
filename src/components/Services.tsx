import { PersonStanding, BookOpen, Brain, Phone, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { BrandText } from './BrandText'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const brands = [
    {
        icon: Phone,
        name: 'Salespirates',
        brand: 'salespirates' as const,
        description:
            'Ihre externe Vertriebsagentur für Inbound- oder Outboundsales. Wir liefern Leads oder unterstützen Ihren Vertrieb mit messbaren Ergebnissen.',
    },
    {
        icon: PersonStanding,
        name: 'Rodeo-Consulting',
        brand: 'rodeo' as const,
        description:
            'Strategische Sales-Beratung, die Ihren Vertrieb neu ausrichtet, absolut skalierbar macht und mit Effizienz zum Wachstum führt.',
    },
    {
        icon: BookOpen,
        name: 'Oldschool-train',
        brand: 'oldschool-train' as const,
        description:
            'Authentische Sales-Coachings die wirklich weiterbringen. Erfahrung, Empathie und echte Praxis treffen auf moderne Lernmethoden.',
    },
    {
        icon: Brain,
        name: 'Sales-AI-Germany',
        brand: 'sales-ai-germany' as const,
        description:
            'Wir beraten Sie, welche KI-Tools für Sales-Teams aktuell Sinn machen und zeigen, wie KI Ihren Vertrieb tatsächlich smarter macht.',
    },
]

export const Services = () => {
    return (
        <section className="container mx-auto px-4 py-24">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Header */}
                <div className="text-center space-y-4">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tight">Unsere Marken</h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Vier starke Marken, ein gemeinsames Ziel:{' '}
                        <span className="underline decoration-muted">Ihr Vertriebserfolg</span>
                    </p>
                </div>

                {/* Brands Grid */}
                <div className="border border-foreground/20 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                        {brands.map((brand, index) => {
                            const isEven = index % 2 === 0
                            const isTopRow = index < 2

                            return (
                                <div
                                    key={index}
                                    className={cn(
                                        'group relative bg-card hover:bg-card/50 transition-all duration-300',
                                        !isTopRow && 'border-t border-foreground/20',
                                        !isEven && 'md:border-l border-foreground/20'
                                    )}
                                >
                                    <Link href="/unsere-marken" className="block">
                                        <div className="p-8 space-y-4">
                                            <div className="flex items-start justify-between">
                                                <h3 className="text-2xl md:text-muted font-semibold">
                                                    <BrandText brand={brand.brand}>{brand.name}</BrandText>
                                                </h3>
                                                <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                            </div>

                                            {/* Description */}
                                            <p className="text-muted-foreground leading-relaxed">{brand.description}</p>
                                        </div>
                                    </Link>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* CTA Button */}
                <div className="text-center pt-4">
                    <Button asChild size="lg" className="group">
                        <Link href="/team">
                            Lernen sie das Team kennen!
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    )
}
