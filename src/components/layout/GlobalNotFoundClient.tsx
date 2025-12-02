'use client'

import { useEffect, useState } from 'react'

import { usePathname } from 'next/navigation'

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)

export default function GlobalNotFoundClient() {
    const location = usePathname()

    type Particle = {
        left: string
        top: string
        delay: string
        duration: string
        opacity: number
    }

    const [particles, setParticles] = useState<Particle[]>([])

    useEffect(() => {
        const generatedParticles: Particle[] = Array.from({ length: 25 }).map(() => ({
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            delay: `${Math.random() * 5}s`,
            duration: `${5 + Math.random() * 10}s`,
            opacity: Number(clamp(Math.random(), 0.5, 1).toFixed(2)),
        }))

        // console.log(...generatedParticles)
        // schedule update next frame to avoid eslint “setState in effect” warning
        const id = requestAnimationFrame(() => setParticles(generatedParticles))
        return () => cancelAnimationFrame(id)
    }, [])

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-background antialiased overflow-hidden">
            {/* subtle background gradients */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,var(--primary)_0%,transparent_50%)] opacity-20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_60%,var(--primary)_0%,transparent_50%)] opacity-20" />

            {/* main card */}
            <div className="relative z-10 text-center p-8 backdrop-blur-lg rounded-2xl border border-primary/20 bg-background/50">
                <div className="relative mb-8 select-none">
                    <h1 className="text-8xl md:text-9xl font-bold text-foreground relative">
                        <span className="absolute -inset-0.5 text-primary blur-xl opacity-50 animate-pulse">404</span>
                        <span className="relative">404</span>
                        <span className="absolute inset-0 text-primary translate-x-1 translate-y-0.5 opacity-50 mix-blend-screen">
                            404
                        </span>
                        <span className="absolute inset-0 text-primary/50 -translate-x-1 -translate-y-0.5 opacity-50 mix-blend-multiply">
                            404
                        </span>
                    </h1>
                </div>

                <div className="mb-8 space-y-4">
                    <p className="text-xl text-muted-foreground">Verloren im digitalen Meer?</p>
                    <div className="px-4 py-2 rounded-lg bg-muted/50 border border-primary/10">
                        <code className="text-primary font-mono font-medium">{location}</code>
                    </div>
                    <p className="text-xl text-muted-foreground">scheint sich entfernt zu haben...</p>
                </div>
            </div>

            {/* floating particles */}
            <div className="absolute inset-0 pointer-events-none">
                {particles.map((p, i) => (
                    <span
                        key={i}
                        className="absolute w-1 h-1 bg-primary/30 rounded-full animate-float"
                        style={{
                            left: p.left,
                            top: p.top,
                            animationDelay: p.delay,
                            animationDuration: p.duration,
                            opacity: p.opacity,
                        }}
                    />
                ))}
            </div>
        </div>
    )
}
