'use client'

import { useState, useEffect, useRef } from 'react'

import { Hero } from '@/components/sections/Hero'
import { HomeBrands } from '@/components/sections/home/HomeBrands'
import { HomeCTA } from '@/components/sections/home/HomeCTA'
import { HomeFeatures } from '@/components/sections/home/HomeFeatures'
import { HomeStats } from '@/components/sections/home/HomeStats'

export default function Page() {
    const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set())
    const sectionRefs = useRef<(HTMLElement | null)[]>([])

    useEffect(() => {
        const observers: IntersectionObserver[] = []

        sectionRefs.current.forEach((section, index) => {
            if (!section) return

            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setVisibleSections((prev) => new Set(prev).add(index))
                        }
                    })
                },
                { threshold: 0.2 }
            )

            observer.observe(section)
            observers.push(observer)
        })

        return () => {
            observers.forEach((observer) => observer.disconnect())
        }
    }, [])

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Section */}
            <Hero />

            {/* Features Section */}
            <div
                ref={(el) => {
                    sectionRefs.current[0] = el
                }}
            >
                <HomeFeatures isVisible={visibleSections.has(0)} />
            </div>

            {/* Brands Section */}
            <div
                ref={(el) => {
                    sectionRefs.current[1] = el
                }}
            >
                <HomeBrands isVisible={visibleSections.has(1)} />
            </div>

            {/* Stats Section */}
            <div
                ref={(el) => {
                    sectionRefs.current[2] = el
                }}
            >
                <HomeStats isVisible={visibleSections.has(2)} />
            </div>

            {/* CTA Section */}
            <div
                ref={(el) => {
                    sectionRefs.current[3] = el
                }}
            >
                <HomeCTA isVisible={visibleSections.has(3)} />
            </div>
        </div>
    )
}
