'use client'

import { ArrowRight, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { Button } from '../../ui/button'

interface HomeCTAProps {
    isVisible: boolean
}

export const HomeCTA = ({ isVisible }: HomeCTAProps) => {
    const t = useTranslations('cta')

    return (
        <section className="relative py-40 overflow-hidden">
            {/* Background with smooth blend */}
            <div className="absolute inset-0 bg-linear-to-b from-primary/5 via-background to-background" />
            <div className="absolute inset-0 dot-pattern opacity-20" />

            {/* Extended top blend from previous section for smooth transition */}
            <div className="absolute top-0 left-0 right-0 h-64 bg-linear-to-b from-primary/5 via-primary/3 to-transparent pointer-events-none" />

            {/* Floating orbs */}
            <div className="absolute top-1/4 left-[10%] w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />
            <div
                className="absolute bottom-1/4 right-[10%] w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse-slow"
                style={{ animationDelay: '1.5s' }}
            />

            <div className="container mx-auto px-3 relative z-10">
                <div className="max-w-4xl mx-auto text-center space-y-10">
                    <div
                        className={cn(
                            'opacity-0 -translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                    >
                        <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
                            {t('title')}{' '}
                            <span className="bg-linear-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                                {t('titleHighlight')}
                            </span>
                        </h2>
                    </div>

                    <p
                        className={cn(
                            'text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed opacity-0 -translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                        style={{ transitionDelay: '200ms' }}
                    >
                        {t('subtitle')}
                    </p>

                    <div
                        className={cn(
                            'flex flex-col sm:flex-row gap-4 justify-center items-center opacity-0 translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                        style={{ transitionDelay: '400ms' }}
                    >
                        <Button
                            asChild
                            size="lg"
                            className="group shadow-2xl shadow-primary/20 hover:shadow-primary/30 hover:scale-105 transition-all duration-300 px-8 py-7 text-lg"
                        >
                            <Link href="/contact">
                                {t('primary')}
                                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </Button>

                        <Button asChild size="lg" variant="outline" className="px-8 py-7 text-lg">
                            <Link href="mailto:touch@advantisgroup.de">
                                <Mail className="w-5 h-5 mr-2" />
                                {t('secondary')}
                            </Link>
                        </Button>
                    </div>

                    <p
                        className={cn(
                            'text-sm text-muted-foreground opacity-0 transition-all duration-1000',
                            isVisible && 'opacity-100'
                        )}
                        style={{ transitionDelay: '600ms' }}
                    >
                        {t('benefits')}
                    </p>
                </div>
            </div>
        </section>
    )
}
