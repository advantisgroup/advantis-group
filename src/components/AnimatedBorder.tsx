'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedBorderProps {
    children: React.ReactNode
    className?: string
    particleCount?: number
    speed?: number
}

export const AnimatedBorder = ({ children, className, particleCount = 50, speed = 0.5 }: AnimatedBorderProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const animationFrameRef = useRef<number>(0)
    const particlesRef = useRef<{ offset: number; speed: number; size: number }[]>([])

    useEffect(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Initialize particles
        particlesRef.current = Array.from({ length: particleCount }, () => ({
            offset: Math.random(),
            speed: 0.3 + Math.random() * speed,
            size: 1 + Math.random() * 2,
        }))

        const resizeCanvas = () => {
            const rect = container.getBoundingClientRect()
            canvas.width = rect.width
            canvas.height = rect.height
        }
        resizeCanvas()

        const resizeObserver = new ResizeObserver(resizeCanvas)
        resizeObserver.observe(container, {})

        let time = 0

        const animate = () => {
            time += 0.01
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            const w = canvas.width
            const h = canvas.height
            const perimeter = 2 * (w + h)

            particlesRef.current.forEach((particle) => {
                particle.offset = (particle.offset + particle.speed * 0.001) % 1

                const distance = particle.offset * perimeter
                let x, y

                if (distance < w) {
                    // Top edge
                    x = distance
                    y = 0
                } else if (distance < w + h) {
                    // Right edge
                    x = w
                    y = distance - w
                } else if (distance < 2 * w + h) {
                    // Bottom edge
                    x = w - (distance - w - h)
                    y = h
                } else {
                    // Left edge
                    x = 0
                    y = h - (distance - 2 * w - h)
                }

                // Draw particle with glow
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.size * 3)
                gradient.addColorStop(0, 'rgba(100, 150, 255, 0.8)')
                gradient.addColorStop(0.5, 'rgba(100, 150, 255, 0.4)')
                gradient.addColorStop(1, 'rgba(100, 150, 255, 0)')

                ctx.fillStyle = gradient
                ctx.beginPath()
                ctx.arc(x, y, particle.size * 3, 0, Math.PI * 2)
                ctx.fill()
            })

            animationFrameRef.current = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            resizeObserver.disconnect()
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [particleCount, speed])

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none rounded-lg" />
            {children}
        </div>
    )
}
