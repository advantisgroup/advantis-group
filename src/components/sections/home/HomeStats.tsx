'use client'

import { TrendingUp, Users, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

interface HomeStatsProps {
    isVisible: boolean
}

export const HomeStats = ({ isVisible }: HomeStatsProps) => {
    const stats = [
        { icon: TrendingUp, value: '15+', label: 'Jahre Erfahrung' },
        { icon: Users, value: '500+', label: 'Erfolgreiche Projekte' },
        { icon: Sparkles, value: '4', label: 'Premium Marken' },
    ]

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Background with blend */}
            <div className="absolute inset-0 bg-background" />
            <div className="absolute inset-0 noise-texture opacity-10" />

            {/* Top blend from previous section */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-background to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-6xl mx-auto">
                    {/* Stats Grid */}
                    <div className="grid md:grid-cols-3 gap-12">
                        {stats.map((stat, idx) => {
                            const Icon = stat.icon

                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'text-center space-y-4 opacity-0 scale-90 transition-all duration-1000',
                                        isVisible && 'opacity-100 scale-100'
                                    )}
                                    style={{ transitionDelay: `${idx * 150}ms` }}
                                >
                                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20">
                                        <Icon className="w-10 h-10 text-primary" />
                                    </div>
                                    <div className="text-6xl md:text-7xl font-bold text-primary">{stat.value}</div>
                                    <div className="text-xl font-semibold">{stat.label}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Extended bottom blend to next section for smooth transition */}
            <div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-b from-transparent via-primary/3 to-primary/5 pointer-events-none" />
        </section>
    )
}
