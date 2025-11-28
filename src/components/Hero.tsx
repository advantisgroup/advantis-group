'use client'

import Link from 'next/link'

import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react'

import { useIsMobile } from '@/hooks/use-mobile'

import { BrandText } from './BrandText'
import GradientBackground from './lightswind/gradient-background'
import { SectionDivider } from './SectionDivider'
import { ShapeParticles } from './ShapeParticles'
import { Button } from './ui/button'

export const Hero = () => {
    const isMobile = useIsMobile()
    return (
        <section className="relative h-screen flex items-center">
            {/* Enhanced Gradient Background */}
            <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden">
                <GradientBackground backdropBlurAmount="lg" className="h-full w-full opacity-60" />

                {/* Smooth fade-out at bottom for seamless transition */}
                <div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-b from-transparent via-background/60 to-background pointer-events-none" />
            </div>

            {/* Enhanced Shape Particles - More particles for richer effect */}
            <div className="absolute inset-0 -z-5">
                <ShapeParticles
                    shape="diamond"
                    particleCount={180}
                    className="w-full h-full opacity-70"
                    // More fluid physics
                    interactionRadius={200}
                    repelForce={1.8}
                    returnForce={0.018}
                    damping={0.86}
                    maxVelocity={12}
                />
            </div>

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

            <div className="container mx-auto px-4 w-full relative z-10 -top-[10vh]">
                <div className="md:max-w-7xl max-w-full mx-auto text-center space-y-6">
                    <div className="space-y-2">
                        <div className="inline-flex group items-center gap-2 px-3 py-1 rounded-3xl border border-border bg-background/50 text-sm backdrop-blur-sm">
                            <Sparkles className="w-3.5 h-3.5" />
                            <BrandText
                                brand="advantis"
                                hoverable
                                keepRestColor
                                groupHover
                                className="group-hover:text-shadow-xs text-shadow-black/30 duration-300"
                            >
                                Advantis Group
                            </BrandText>
                        </div>

                        {isMobile ? (
                            <h1 className="font-bold">
                                <span className="text-3xl">Mehr als ein Unternehmen</span> <br />
                                <span className="text-4xl">komplette Sales Power</span>
                            </h1>
                        ) : (
                            <h1 className="text-4xl group md:text-8xl font-bold leading-tight">
                                Mehr als ein Unternehmen, komplette{' '}
                                <BrandText hoverable groupHover>
                                    Sales Power
                                </BrandText>
                            </h1>
                        )}

                        {!isMobile && (
                            <p className="text-lg md:text-3xl text-muted-foreground font-medium">
                                Wir bringen Ihren Vertrieb auf das nächste Level!
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 md:pt-1">
                        <Button asChild size="lg">
                            <Link href="/kontakt">
                                Jetzt Kontakt aufnehmen
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                            <Link href="/unsere-marken">Unsere Marken entdecken</Link>
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
