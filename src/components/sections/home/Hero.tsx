'use client'

import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useIsMobile } from '@/hooks/use-mobile'
import { Link } from '@/i18n/navigation'

import { BrandText } from '../../effects/BrandText'
import { SectionDivider } from '../../layout/SectionDivider'
import { Button } from '../../ui/button'

export const Hero = () => {
    const isMobile = useIsMobile()
    const t = useTranslations('hero')

    return (
        <section className="relative h-screen flex items-center">
            {/* Additional decorative floating elements */}
            <div className="absolute top-[20%] left-[15%] w-96 h-96 bg-primary/8 rounded-full blur-3xl animate-pulse-slow" />
            <div
                className="absolute top-[30%] right-[10%] w-[500px] h-[500px] bg-secondary/8 rounded-full blur-3xl animate-pulse-slow"
                style={{ animationDelay: '2.5s' }}
            />
            <div
                className="absolute bottom-[25%] left-[25%] w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse-slow"
                style={{ animationDelay: '1.2s' }}
            />

            {/* Additional blur overlay at bottom edge for extra smoothness */}
            <div
                className="absolute bottom-0 left-0 right-0 h-32 bg-background/90 backdrop-blur-md pointer-events-none"
                style={{
                    maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
                }}
            />

            <div className="container mx-auto px-4 w-full relative z-10 -top-[3vh]">
                <div className="md:max-w-7xl max-w-full mx-auto text-center space-y-6">
                    <div className="space-y-2">
                        <div className="inline-flex group items-center gap-2 px-3 py-1 rounded-3xl border border-border bg-background/50 text-sm backdrop-blur-sm">
                            <Sparkles className="w-3.5 h-3.5" />
                            <BrandText brand="advantis" hoverable keepRestColor groupHover>
                                Advantis Group
                            </BrandText>
                        </div>

                        {isMobile ? (
                            <h1 className="font-bold">
                                <span className="text-3xl">{t('title')}</span> <br />
                                <span className="text-4xl">{t('titleHighlight')}</span>
                            </h1>
                        ) : (
                            <h1 className="text-4xl group md:text-8xl font-bold leading-tight">
                                {t('title')}{' '}
                                <BrandText hoverable groupHover>
                                    {t('titleHighlight')}
                                </BrandText>
                            </h1>
                        )}

                        {!isMobile && (
                            <p className="text-lg md:text-3xl text-muted-foreground font-medium">{t('subtitle')}</p>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 md:pt-1">
                        <Button asChild size="lg">
                            <Link href="/contact">
                                {t('ctaPrimary')}
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                            <Link href="/brands">{t('ctaSecondary')}</Link>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 animate-bounce">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ChevronDown className="w-5 h-5" />
                </div>
            </div>

            {/* Section divider at bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-10">
                <SectionDivider variant="dots" opacity={0.3} />
            </div>
        </section>
    )
}
