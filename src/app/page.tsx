import { Hero } from '@/components/Hero'
import { Features } from '@/components/Features'
import { Services } from '@/components/Services'
import { Stats } from '@/components/Stats'
import { CTA } from '@/components/CTA'

export default function Page() {
    return (
        <div className="min-h-screen">
            <main>
                {/* Hero with built-in blur gradient transition */}
                <Hero />

                {/* Features section */}
                <Features />

                {/* Simple diagonal bevel transition between Features and Services */}
                <div className="relative">
                    <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-full h-16 fill-background">
                        <path d="M0 0L1200 100H0V0Z" />
                    </svg>
                </div>

                {/* Services section */}
                <Services />

                {/* Stats section */}
                <Stats />

                {/* CTA section */}
                <CTA />
            </main>
        </div>
    )
}
