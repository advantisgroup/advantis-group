'use client'

import { Hero } from '@/components/Hero'
import { HomeFeatures } from '@/components/HomeFeatures'
import { HomeBrands } from '@/components/HomeBrands'
import { HomeStats } from '@/components/HomeStats'
import { HomeCTA } from '@/components/HomeCTA'
import { useState, useEffect, useRef } from 'react'

export default function Page() {
    const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set())
    const sectionRefs = useRef<(HTMLElement | null)[]>([])

    // Intersection Observer for smooth scroll animations
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
