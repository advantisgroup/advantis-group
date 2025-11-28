'use client'

import { useEffect, useRef } from 'react'

interface Particle {
    x: number
    y: number
    baseX: number
    baseY: number
    vx: number
    vy: number
    size: number
}

export const ParticleBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const particlesRef = useRef<Particle[]>([])
    const mouseRef = useRef({ x: 0, y: 0 })
    const animationFrameRef = useRef<number>(0)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Set canvas size
        const resizeCanvas = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            initParticles()
        }

        // Initialize static particles
        const initParticles = () => {
            particlesRef.current = []
            const particleCount = Math.floor((canvas.width * canvas.height) / 15000) // Density based on screen size

            for (let i = 0; i < particleCount; i++) {
                const x = Math.random() * canvas.width
                const y = Math.random() * canvas.height
                particlesRef.current.push({
                    x,
                    y,
                    baseX: x,
                    baseY: y,
                    vx: 0,
                    vy: 0,
                    size: 1 + Math.random() * 2,
                })
            }
        }

        resizeCanvas()
        window.addEventListener('resize', resizeCanvas, {})

        // Mouse move handler - just track position
        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current = { x: e.clientX, y: e.clientY }
        }

        window.addEventListener('mousemove', handleMouseMove, {})

        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            const mouse = mouseRef.current
            const interactionRadius = 150 // Distance at which particles react

            // Update and draw particles
            particlesRef.current.forEach((particle) => {
                // Calculate distance from mouse
                const dx = mouse.x - particle.x
                const dy = mouse.y - particle.y
                const distance = Math.sqrt(dx * dx + dy * dy)

                // React to mouse proximity
                if (distance < interactionRadius) {
                    const force = (interactionRadius - distance) / interactionRadius
                    const angle = Math.atan2(dy, dx)

                    // Push particles away from mouse
                    particle.vx -= Math.cos(angle) * force * 0.5
                    particle.vy -= Math.sin(angle) * force * 0.5
                }

                // Return to base position
                const returnForce = 0.05
                particle.vx += (particle.baseX - particle.x) * returnForce
                particle.vy += (particle.baseY - particle.y) * returnForce

                // Apply velocity with damping
                particle.vx *= 0.95
                particle.vy *= 0.95
                particle.x += particle.vx
                particle.y += particle.vy

                // Draw particle
                const opacity = 0.3 + (particle.size / 3) * 0.3
                ctx.fillStyle = `rgba(100, 150, 255, ${opacity})`
                ctx.beginPath()
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
                ctx.fill()
            })

            // Draw connections between nearby particles
            for (let i = 0; i < particlesRef.current.length; i++) {
                for (let j = i + 1; j < particlesRef.current.length; j++) {
                    const p1 = particlesRef.current[i]
                    const p2 = particlesRef.current[j]
                    const dx = p1.x - p2.x
                    const dy = p1.y - p2.y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    if (distance < 120) {
                        const opacity = (1 - distance / 120) * 0.15
                        ctx.strokeStyle = `rgba(100, 150, 255, ${opacity})`
                        ctx.lineWidth = 0.5
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                    }
                }
            }

            animationFrameRef.current = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            window.removeEventListener('resize', resizeCanvas)
            window.removeEventListener('mousemove', handleMouseMove)
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [])

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.6 }} />
}
