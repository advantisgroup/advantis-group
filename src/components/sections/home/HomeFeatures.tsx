'use client'

import React, { useState } from 'react'

import { TrendingUp, Zap, Target, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import { BrandText } from '../../effects/BrandText'

interface HomeFeaturesProps {
    isVisible: boolean
}

export const HomeFeatures = ({ isVisible }: HomeFeaturesProps) => {
    const t = useTranslations('features')
    const [hoveredCard, setHoveredCard] = useState<number | null>(null)
    const [shinePosition, setShinePosition] = useState({ x: 0, y: 0 })

    const features = [
        {
            icon: TrendingUp,
            title: t('feature1.title'),
            desc: t('feature1.description'),
            gradient: 'from-orange-500/20 to-red-500/20',
            iconBg: 'bg-orange-500/10',
            iconBorder: 'border-orange-500/30',
            glowColor: 'shadow-orange-500/20',
        },
        {
            icon: Zap,
            title: t('feature2.title'),
            desc: t('feature2.description'),
            gradient: 'from-primary/20 to-purple-500/20',
            iconBg: 'bg-primary/10',
            iconBorder: 'border-primary/30',
            glowColor: 'shadow-primary/20',
        },
        {
            icon: Target,
            title: t('feature3.title'),
            desc: t('feature3.description'),
            gradient: 'from-blue-500/20 to-cyan-500/20',
            iconBg: 'bg-blue-500/10',
            iconBorder: 'border-blue-500/30',
            glowColor: 'shadow-blue-500/20',
        },
    ]

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, idx: number) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        setShinePosition({ x, y })
        setHoveredCard(idx)
    }

    const handleMouseLeave = () => {
        setHoveredCard(null)
    }

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Animated background elements */}
            <div className="absolute inset-0 bg-linear-to-b from-background via-background/95 to-background" />

            {/* Floating orbs */}
            <div className="absolute top-20 right-[10%] w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />
            <div className="absolute bottom-20 left-[15%] w-96 h-96 bg-orange-500/5 rounded-full blur-3xl animate-pulse-slower" />

            {/* Subtle grid pattern */}
            <div className="absolute inset-0 dot-pattern opacity-10" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-7xl mx-auto space-y-20">
                    {/* Header */}
                    <div
                        className={cn(
                            'text-center space-y-6 opacity-0 -translate-y-8 transition-all duration-1000',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
                            <Sparkles className="w-4 h-4" />
                            <span>{t('badge')}</span>
                        </div>
                        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
                            {t('title')} <BrandText brand="advantis">{t('titleBrand')}</BrandText>?
                        </h2>
                        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                            {t('subtitle')}
                        </p>
                    </div>

                    {/* Feature Cards - Bento Grid Style */}
                    <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
                        {features.map((feature, idx) => {
                            const Icon = feature.icon
                            const isHovered = hoveredCard === idx

                            // Calculate shine direction based on mouse entry point
                            const getShineTransform = () => {
                                if (!isHovered) return '-translate-x-full'

                                // Determine direction based on mouse position
                                const { x } = shinePosition

                                // If mouse enters from left side
                                if (x < 50) {
                                    return 'translate-x-full'
                                }
                                // If mouse enters from right side
                                else {
                                    return '-translate-x-full'
                                }
                            }

                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'opacity-0 translate-y-12 transition-all duration-1000',
                                        isVisible && 'opacity-100 translate-y-0'
                                    )}
                                    style={{ transitionDelay: `${200 + idx * 150}ms` }}
                                >
                                    <div
                                        className="group relative h-full"
                                        onMouseEnter={(e) => handleMouseEnter(e, idx)}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        {/* Card */}
                                        <div
                                            className={cn(
                                                'relative h-full p-8 rounded-3xl bg-card/50 backdrop-blur-sm border border-border/50',
                                                'hover:border-primary/50 transition-all duration-500',
                                                'hover:scale-[1.02] hover:shadow-2xl',
                                                feature.glowColor
                                            )}
                                        >
                                            {/* Gradient overlay */}
                                            <div
                                                className={cn(
                                                    'absolute inset-0 bg-linear-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl',
                                                    feature.gradient
                                                )}
                                            />

                                            {/* Shine effect on hover */}
                                            <div className="absolute inset-0 rounded-3xl overflow-hidden">
                                                <div
                                                    className={cn(
                                                        'absolute inset-0 transition-transform duration-1000 bg-linear-to-r from-transparent via-white/10 to-transparent',
                                                        getShineTransform()
                                                    )}
                                                />
                                            </div>

                                            <div className="relative space-y-6">
                                                {/* Icon */}
                                                <div
                                                    className={cn(
                                                        'inline-flex items-center justify-center w-16 h-16 rounded-2xl border',
                                                        'group-hover:scale-110 group-hover:rotate-3 transition-all duration-300',
                                                        feature.iconBg,
                                                        feature.iconBorder
                                                    )}
                                                >
                                                    <Icon className="w-8 h-8 text-primary" />
                                                </div>

                                                {/* Content */}
                                                <div className="space-y-3">
                                                    <h3 className="text-2xl font-bold leading-tight">
                                                        {feature.title}
                                                    </h3>
                                                    <p className="text-muted-foreground leading-relaxed">
                                                        {feature.desc}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Floating number badge */}
                                        <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary backdrop-blur-sm">
                                            {idx + 1}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Bottom stats or CTA */}
                    <div
                        className={cn(
                            'flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-0 translate-y-8 transition-all duration-1000 delay-700',
                            isVisible && 'opacity-100 translate-y-0'
                        )}
                    >
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary">15+</div>
                            <div className="text-sm text-muted-foreground">{t('stats.experience')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary">4</div>
                            <div className="text-sm text-muted-foreground">{t('stats.brands')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary">500</div>
                            <div className="text-sm text-muted-foreground">{t('stats.projects')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary">100%</div>
                            <div className="text-sm text-muted-foreground">{t('stats.passion')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom gradient blend */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-b from-transparent to-background pointer-events-none" />

            {/* CSS for custom animations */}
            <style jsx>{`
                @keyframes pulse-slow {
                    0%,
                    100% {
                        opacity: 0.3;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.5;
                        transform: scale(1.1);
                    }
                }

                @keyframes pulse-slower {
                    0%,
                    100% {
                        opacity: 0.2;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.4;
                        transform: scale(1.15);
                    }
                }

                .animate-pulse-slow {
                    animation: pulse-slow 8s ease-in-out infinite;
                }

                .animate-pulse-slower {
                    animation: pulse-slower 12s ease-in-out infinite;
                }
            `}</style>
        </section>
    )
}
