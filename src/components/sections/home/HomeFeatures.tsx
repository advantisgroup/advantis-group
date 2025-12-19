'use client'

import { useEffect, useRef } from 'react'

import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { TrendingUp, Zap, Target, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import { BrandText } from '../../effects/BrandText'

interface HomeFeaturesProps {
    isVisible: boolean
}

function CountUp({
    to,
    suffix = '',
    prefix = '',
    className,
}: {
    to: number
    suffix?: string
    prefix?: string
    className?: string
}) {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { once: true, margin: '-100px' })
    const value = useMotionValue(0)
    const springValue = useSpring(value, {
        stiffness: 50,
        damping: 20,
        restDelta: 0.001,
        duration: 3, // Gradual ease
    })
    const displayValue = useTransform(springValue, (current) => {
        const val = Math.round(current)
        // Pad to 3 digits like "001", "015", "103"
        const formatted = val.toString().padStart(3, '0')
        // Removing padding if it exceeds 3 digits naturally (e.g. 1000)
        return formatted
    })

    useEffect(() => {
        if (inView) {
            value.set(to)
        }
    }, [inView, to, value])

    return (
        <span ref={ref} className={className}>
            {prefix}
            <motion.span>{displayValue}</motion.span>
            {suffix}
        </span>
    )
}

export const HomeFeatures = ({ isVisible }: HomeFeaturesProps) => {
    const t = useTranslations('features')

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
                            'text-center space-y-6 transition-all duration-1000',
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'
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

                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                                    transition={{
                                        duration: 0.8,
                                        delay: 0.2 + idx * 0.1,
                                    }}
                                    className="group relative h-full"
                                >
                                    <motion.div
                                        className={cn(
                                            'relative h-full p-8 rounded-3xl bg-card/50 backdrop-blur-sm border border-border/50',
                                            'overflow-hidden',
                                            feature.glowColor
                                        )}
                                        whileHover="hover"
                                        initial="rest"
                                        animate="rest"
                                        variants={{
                                            rest: {
                                                y: 0,
                                                scale: 1,
                                                boxShadow: '0 0px 0px rgba(0,0,0,0)',
                                            },
                                            hover: {
                                                y: -8,
                                                scale: 1.02,
                                                boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)',
                                            },
                                        }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 300,
                                            damping: 20,
                                        }}
                                    >
                                        {/* Gradient Background that fades in */}
                                        <div
                                            className={cn(
                                                'absolute inset-0 bg-linear-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                                                feature.gradient
                                            )}
                                        />

                                        {/* Content container */}
                                        <div className="relative space-y-6 z-10">
                                            {/* Icon */}
                                            <motion.div
                                                className={cn(
                                                    'inline-flex items-center justify-center w-16 h-16 rounded-2xl border',
                                                    feature.iconBg,
                                                    feature.iconBorder
                                                )}
                                                variants={{
                                                    rest: { rotate: 0, scale: 1 },
                                                    hover: { rotate: [0, -5, 5, 0], scale: 1.1 },
                                                }}
                                                transition={{ duration: 0.5 }}
                                            >
                                                <Icon className="w-8 h-8 text-primary" />
                                            </motion.div>

                                            {/* Text Content */}
                                            <div className="space-y-3">
                                                <motion.h3
                                                    className="text-2xl font-bold leading-tight"
                                                    variants={{
                                                        rest: { y: 0 },
                                                        hover: { y: -2 },
                                                    }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    {feature.title}
                                                </motion.h3>
                                                <motion.p
                                                    className="text-muted-foreground leading-relaxed"
                                                    variants={{
                                                        rest: { y: 0 },
                                                        hover: { y: -2 },
                                                    }}
                                                    transition={{ duration: 0.2, delay: 0.05 }}
                                                >
                                                    {feature.desc}
                                                </motion.p>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Floating number badge */}
                                    <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary backdrop-blur-sm z-20">
                                        {'00' + (idx + 1)}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>

                    {/* Bottom stats */}
                    <div
                        className={cn(
                            'flex flex-wrap items-center justify-center gap-8 md:gap-12 transition-all duration-1000 delay-700',
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        )}
                    >
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
                                <CountUp to={15} suffix="+" />
                            </div>
                            <div className="text-sm text-muted-foreground">{t('stats.experience')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
                                <CountUp to={4} />
                            </div>
                            <div className="text-sm text-muted-foreground">{t('stats.brands')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
                                <CountUp to={500} />
                            </div>
                            <div className="text-sm text-muted-foreground">{t('stats.projects')}</div>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-border" />
                        <div className="text-center space-y-1">
                            <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums">
                                <CountUp to={100} suffix="%" />
                            </div>
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
