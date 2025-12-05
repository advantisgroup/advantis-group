'use client'

import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { Hero } from '@/components/sections/Hero'
import { HomeBrands } from '@/components/sections/home/HomeBrands'
import { HomeCTA } from '@/components/sections/home/HomeCTA'
import { HomeFeatures } from '@/components/sections/home/HomeFeatures'

export default function Page() {
    return (
        <div className="min-h-screen bg-background">
            {/* Hero Section */}
            <ScrollReveal>
                <Hero />
            </ScrollReveal>

            {/* Features Section */}
            <ScrollReveal>
                <HomeFeatures isVisible={true} />
            </ScrollReveal>

            {/* Brands Section */}
            <ScrollReveal>
                <HomeBrands isVisible={true} />
            </ScrollReveal>

            {/* CTA Section */}
            <ScrollReveal>
                <HomeCTA isVisible={true} />
            </ScrollReveal>
        </div>
    )
}
