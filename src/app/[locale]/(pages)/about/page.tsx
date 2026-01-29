'use client'

import Image from 'next/image'

import { motion } from 'framer-motion'
import { Target, Zap, Heart, ArrowRight, TrendingUp, Users, Award, ChevronDown, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { BrandText } from '@/components/effects/BrandText'
import { CountUp } from '@/components/effects/CountUp'
import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { SectionDivider } from '@/components/layout/SectionDivider'
import { Button } from '@/components/ui/button'
import { useSingleLetterLogo } from '@/hooks/use-logo'
import { Link } from '@/i18n/navigation'

export default function UberUns() {
    const t = useTranslations('about')
    const logo = useSingleLetterLogo()

    // Values Data
    const values = [
        {
            icon: Target,
            title: t('values.experienceTitle'),
            description: t('values.experienceDesc'),
            gradient: 'from-blue-500/20 to-cyan-500/20',
            iconColor: 'text-blue-500',
        },
        {
            icon: Zap,
            title: t('values.innovationTitle'),
            description: t('values.innovationDesc'),
            gradient: 'from-amber-500/20 to-orange-500/20',
            iconColor: 'text-amber-500',
        },
        {
            icon: Heart,
            title: t('values.passionTitle'),
            description: t('values.passionDesc'),
            gradient: 'from-red-500/20 to-rose-500/20',
            iconColor: 'text-red-500',
        },
    ]

    // Stats Data
    const stats = [
        {
            icon: TrendingUp,
            value: 15,
            label: t('stats.experience'),
        },
        {
            icon: Users,
            value: 500,
            label: t('stats.projects'),
        },
        {
            icon: Award,
            value: 4,
            label: t('stats.brands'),
        },
    ]

    return (
        <div className="min-h-screen relative overflow-hidden bg-background selection:bg-primary/20">
            {/* Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[10%] left-[20%] w-160 h-160 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" />
                <div
                    className="absolute top-[40%] right-[10%] w-120 h-120 bg-secondary/5 rounded-full blur-3xl animate-pulse-slow"
                    style={{ animationDelay: '2s' }}
                />
            </div>

            <main className="relative z-10 font-sans">
                {/* Hero Section */}
                <section className="relative h-screen min-h-[800px] flex items-center justify-center pt-20">
                    <div className="container mx-auto px-4 relative z-10 text-center">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-8 leading-[1.1]"
                        >
                            {t('hero.titlePart1')}
                            <span className="block text-transparent bg-clip-text bg-linear-to-r from-primary via-primary/80 to-secondary animate-gradient-x">
                                {t('hero.titlePart2')}
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto mb-10"
                        >
                            {t.rich('hero.subtitle', {
                                brand: (chunks) => (
                                    <BrandText brand="advantis" className="font-semibold">
                                        {chunks as string}
                                    </BrandText>
                                ),
                            })}
                        </motion.p>
                    </div>

                    {/* Scroll Indicator */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1, duration: 1 }}
                        className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce"
                    >
                        <ChevronDown className="w-6 h-6 text-muted-foreground/50" />
                    </motion.div>
                </section>

                <SectionDivider variant="dots" opacity={0.3} className="mb-20" />

                {/* Content Grid */}
                <div className="container mx-auto px-4 py-20 max-w-7xl">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-32">
                        {/* Mission Card */}
                        <ScrollReveal delay={100} className="h-full">
                            <div className="group relative h-full bg-card/30 backdrop-blur-md border border-border/50 rounded-3xl p-8 md:p-12 overflow-hidden transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5">
                                <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="relative z-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-6">
                                        {t('mission.badge')}
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('mission.title')}</h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        {t('mission.description')}
                                    </p>
                                </div>
                                <Target className="absolute -bottom-10 -right-10 w-64 h-64 text-primary/5 group-hover:text-primary/10 transition-colors duration-500 rotate-12" />
                            </div>
                        </ScrollReveal>

                        {/* Vision Card */}
                        <ScrollReveal delay={200} className="h-full">
                            <div className="group relative h-full bg-card/30 backdrop-blur-md border border-border/50 rounded-3xl p-8 md:p-12 overflow-hidden transition-all duration-500 hover:border-secondary/20 hover:shadow-2xl hover:shadow-secondary/5">
                                <div className="absolute inset-0 bg-linear-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="relative z-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-secondary/10 text-xs font-semibold tracking-wider uppercase text-secondary mb-6">
                                        {t('vision.badge')}
                                    </div>
                                    <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('vision.title')}</h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        {t('vision.description')}
                                    </p>
                                </div>
                                <Zap className="absolute -bottom-10 -right-10 w-64 h-64 text-secondary/5 group-hover:text-secondary/10 transition-colors duration-500 rotate-12" />
                            </div>
                        </ScrollReveal>
                    </div>

                    {/* Story Section */}
                    <ScrollReveal delay={100}>
                        <section className="mb-32 relative">
                            <div className="absolute left-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-border to-transparent hidden lg:block" />

                            <div className="grid lg:grid-cols-12 gap-12 lg:gap-24 relative">
                                {/* Decorative Red Line/Marker */}
                                <div className="hidden lg:block absolute left-[-5px] top-12 w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary/50" />

                                <div className="lg:col-span-4 lg:pl-12 pt-14">
                                    <div className="sticky top-32">
                                        <h2 className="text-lg font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">
                                            {t('story.badge')}
                                        </h2>
                                        <div className="w-20 h-1.5 bg-primary rounded-full" />
                                    </div>
                                </div>

                                <div className="lg:col-span-8 space-y-8 bg-card/20 backdrop-blur-sm border border-border/50 rounded-3xl p-8 md:p-12">
                                    <div className="prose prose-lg dark:prose-invert max-w-none">
                                        <p className="text-xl leading-relaxed font-medium text-foreground">
                                            {t.rich('story.text1', {
                                                brand: (chunks) => (
                                                    <BrandText brand="advantis">{chunks as string}</BrandText>
                                                ),
                                                founder: (chunks) => (
                                                    <span className="font-bold text-foreground">{chunks}</span>
                                                ),
                                            })}
                                        </p>
                                        <p className="text-lg text-muted-foreground leading-relaxed">
                                            {t.rich('story.text2', {
                                                brand: (chunks) => (
                                                    <BrandText brand="advantis">{chunks as string}</BrandText>
                                                ),
                                            })}
                                        </p>
                                        <p className="text-lg text-muted-foreground leading-relaxed">
                                            {t('story.text3')}
                                        </p>
                                    </div>

                                    {/* Logo / Image Integration Area */}
                                    <div className="mt-12 pt-12 border-t border-border/30 flex justify-center lg:justify-start opacity-80 hover:opacity-100 transition-opacity">
                                        <div className="relative w-48 h-16 grayscale hover:grayscale-0 transition-all duration-500">
                                            <Image
                                                src={logo}
                                                alt="Advantis Group"
                                                fill
                                                className="object-contain object-left"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Stats Section with Counter */}
                    <ScrollReveal>
                        <section className="mb-32">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {stats.map((stat, _index) => {
                                    const Icon = stat.icon
                                    return (
                                        <div
                                            key={stat.label}
                                            className="relative overflow-hidden bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-8 text-center group hover:border-primary/20 hover:bg-card/60 transition-all duration-300"
                                        >
                                            <div className="absolute inset-0 bg-linear-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                            <div className="relative z-10">
                                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6 group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
                                                    <Icon className="w-8 h-8 text-primary" />
                                                </div>
                                                <div className="text-5xl font-bold text-foreground mb-2 tracking-tight">
                                                    <CountUp value={stat.value} />
                                                </div>
                                                <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">
                                                    {stat.label}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Values Section */}
                    <ScrollReveal>
                        <section className="mb-32">
                            <div className="text-center mb-16">
                                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">
                                    {t('values.badge')}
                                </h2>
                                <h3 className="text-3xl md:text-4xl font-bold">What drives us</h3>
                            </div>

                            <div className="grid md:grid-cols-3 gap-8">
                                {values.map((value, _index) => {
                                    const Icon = value.icon
                                    return (
                                        <div
                                            key={value.title}
                                            className="group relative bg-card/30 backdrop-blur-sm border border-border/50 rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5"
                                        >
                                            <div
                                                className={`absolute inset-0 bg-linear-to-br ${value.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl`}
                                            />

                                            <div className="relative z-10 flex flex-col items-center text-center">
                                                <div
                                                    className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-background/80 mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300`}
                                                >
                                                    <Icon className={`w-8 h-8 ${value.iconColor}`} strokeWidth={1.5} />
                                                </div>
                                                <h3 className="text-xl font-bold mb-4">{value.title}</h3>
                                                <p className="text-muted-foreground leading-relaxed">
                                                    {value.description}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* CTA Section */}
                    <ScrollReveal>
                        <section className="relative rounded-3xl overflow-hidden bg-primary text-primary-foreground p-12 md:p-24 text-center">
                            <div className="absolute inset-0 noise-texture opacity-10 mix-blend-overlay" />
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent" />

                            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('cta.title')}</h2>
                                <p className="text-xl text-primary-foreground/80 leading-relaxed font-medium">
                                    {t('cta.description')}
                                </p>
                                <Button
                                    asChild
                                    size="lg"
                                    variant="secondary"
                                    className="h-14 px-8 text-lg rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
                                >
                                    <Link href="/contact" className="inline-flex items-center gap-2">
                                        <span>{t('cta.button')}</span>
                                        <ArrowRight className="w-5 h-5" />
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
