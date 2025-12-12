'use client'
import React, { use } from 'react'

import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { Hero } from '@/components/sections/Hero'
import { HomeBrands } from '@/components/sections/home/HomeBrands'
import { HomeCTA } from '@/components/sections/home/HomeCTA'
import { HomeFeatures } from '@/components/sections/home/HomeFeatures'

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = use(params)

    React.useEffect(() => {
        window.localStorage.setItem('NEXT_LOCALE', locale)
    }, [locale])

    return (
        <div className="min-h-screen bg-background">
            <ScrollReveal>
                <Hero />
            </ScrollReveal>
            <ScrollReveal>
                <HomeFeatures isVisible={true} />
            </ScrollReveal>
            <ScrollReveal>
                <HomeBrands isVisible={true} />
            </ScrollReveal>
            <ScrollReveal>
                <HomeCTA isVisible={true} />
            </ScrollReveal>
        </div>
    )
}
