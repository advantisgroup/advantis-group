'use client'

import React from 'react'

import Image from 'next/image'

import { Target, Zap, Heart, ArrowRight, TrendingUp, Users, Award } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { BrandText } from '@/components/effects/BrandText'
import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { SectionDivider } from '@/components/layout/SectionDivider'
import { Button } from '@/components/ui/button'
import { useBrandLogo } from '@/hooks/use-logo'
import { Link } from '@/i18n/navigation'

export default function UberUns() {
    const t = useTranslations('about')
    const logo = useBrandLogo()
    const values = [
        {
            icon: Target,
            title: t('values.experienceTitle'),
            description: t('values.experienceDesc'),
        },
        {
            icon: Zap,
            title: t('values.innovationTitle'),
            description: t('values.innovationDesc'),
        },
        {
            icon: Heart,
            title: t('values.passionTitle'),
            description: t('values.passionDesc'),
        },
    ]

    const stats = [
        {
            icon: TrendingUp,
            value: '15+',
            label: t('stats.experience'),
        },
        {
            icon: Users,
            value: '500+',
            label: t('stats.projects'),
        },
        {
            icon: Award,
            value: '4',
            label: t('stats.brands'),
        },
    ]

    return (
        <div className="min-h-screen relative overflow-hidden bg-background">
            <main className="relative z-30">
                {/* Hero Section */}
                <section className="relative pt-32 pb-20 md:pt-40 md:pb-32">
                    <div className="container mx-auto px-4 md:px-6 max-w-6xl">
                        <ScrollReveal>
                            <div className="max-w-4xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
                                    {t('hero.badge')}
                                </div>
                                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
                                    {t('hero.titlePart1')} <br />
                                    {t('hero.titlePart2')}
                                </h1>
                                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl">
                                    {t.rich('hero.subtitle', {
                                        brand: (chunks) => <BrandText brand="advantis">{chunks as string}</BrandText>,
                                    })}
                                </p>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                <SectionDivider variant="dots" opacity={0.3} className="mb-20" />

                <div className="container mx-auto px-4 md:px-6 max-w-6xl pb-32">
                    {/* Mission & Vision */}
                    <ScrollReveal delay={100}>
                        <section className="mb-32">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl p-8 md:p-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-6">
                                        {t('mission.badge')}
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                                        {t('mission.title')}
                                    </h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        {t('mission.description')}
                                    </p>
                                </div>

                                <div className="bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl p-8 md:p-10">
                                    <div className="inline-block px-3 py-1 rounded-md bg-primary/10 text-xs font-semibold tracking-wider uppercase text-primary mb-6">
                                        {t('vision.badge')}
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                                        {t('vision.title')}
                                    </h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        {t('vision.description')}
                                    </p>
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Story Section */}
                    <ScrollReveal delay={200}>
                        <section className="mb-32">
                            <div className="grid md:grid-cols-12 gap-12 md:gap-16">
                                <div className="md:col-span-4">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                        {t('story.badge')}
                                    </h2>
                                    <div className="w-12 h-1 bg-primary rounded-full" />
                                </div>
                                <div className="md:col-span-8 space-y-6">
                                    <p className="text-lg leading-relaxed">
                                        {t.rich('story.text1', {
                                            brand: (chunks) => (
                                                <BrandText brand="advantis">{chunks as string}</BrandText>
                                            ),
                                            founder: (chunks) => <span className="font-semibold">{chunks}</span>,
                                        })}
                                    </p>

                                    <p className="text-lg text-muted-foreground leading-relaxed">
                                        {t.rich('story.text2', {
                                            brand: (chunks) => (
                                                <BrandText brand="advantis">{chunks as string}</BrandText>
                                            ),
                                        })}
                                    </p>

                                    <p className="text-lg text-muted-foreground leading-relaxed">{t('story.text3')}</p>
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Stats */}
                    <ScrollReveal delay={100}>
                        <section className="mb-32">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {stats.map((stat, _index) => {
                                    const Icon = stat.icon
                                    return (
                                        <div
                                            key={stat.label}
                                            className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl p-8 text-center group hover:border-primary/30 transition-all duration-300"
                                        >
                                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                                                <Icon className="w-7 h-7 text-primary" />
                                            </div>
                                            <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                                            <div className="text-sm text-muted-foreground font-medium">
                                                {stat.label}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Values */}
                    <ScrollReveal delay={200}>
                        <section className="mb-32">
                            <div className="mb-12">
                                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    {t('values.badge')}
                                </h2>
                                <div className="w-12 h-1 bg-primary rounded-full" />
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                {values.map((value, _index) => {
                                    const Icon = value.icon
                                    return (
                                        <div
                                            key={value.title}
                                            className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl p-8 group hover:border-primary/30 hover:-translate-y-1 transition-all duration-300"
                                        >
                                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-background/50 mb-6 group-hover:bg-primary/10 transition-colors">
                                                <Icon
                                                    className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors"
                                                    strokeWidth={1.5}
                                                />
                                            </div>
                                            <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                                            <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* Logo Section */}
                    <ScrollReveal delay={150}>
                        <section className="">
                            <div className="flex justify-center">
                                <div className="relative w-full max-w-sm md:max-w-2xl lg:max-w-4xl px-4">
                                    <Image
                                        src={logo}
                                        alt="Advantis Group - All About Sales"
                                        width={3125}
                                        height={1875}
                                        className="w-full h-auto"
                                        priority={false}
                                    />
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>

                    {/* CTA Section */}
                    <ScrollReveal delay={100}>
                        <section className="border-t border-border/50 pt-16">
                            <div className="max-w-3xl">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('cta.title')}</h2>
                                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                                    {t('cta.description')}
                                </p>
                                <Button asChild size="lg">
                                    <Link href="/contact" className="inline-flex items-center gap-2 group">
                                        <span>{t('cta.button')}</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
