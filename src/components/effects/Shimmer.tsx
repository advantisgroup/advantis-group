'use client'

import React from 'react'

import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'

interface ShimmerTextProps {
    children: React.ReactNode
    className?: string
    shimmerWidth?: string
    duration?: string
}

export const ShimmerText = ({ children, className, shimmerWidth = '200%', duration = '30s' }: ShimmerTextProps) => {
    const { resolvedTheme } = useTheme()
    const [isHovered, setIsHovered] = React.useState(false)

    // Dark mode: Stronger shimmer (white/60), standard spread
    // Light mode: More subtle shimmer (white/40), thinner spread to be less distracting
    const shimmerColor = resolvedTheme === 'white' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.4)'

    // Gradient stops
    // Standard: 0% -> 50% -> 100%
    // Thinner (Light mode): 40% -> 50% -> 60% (concentrates the shimmer in the middle)
    const startStop = resolvedTheme === 'dark' ? '0%' : '40%'
    const endStop = resolvedTheme === 'dark' ? '100%' : '60%'

    const gradient = `linear-gradient(to right, var(--foreground) ${startStop}, ${shimmerColor} 50%, var(--foreground) ${endStop})`

    return (
        <span
            className={cn('bg-clip-text text-transparent transition-all duration-500', className)}
            style={{
                backgroundImage: isHovered ? 'none' : gradient,
                backgroundSize: `${shimmerWidth} 100%`,
                animation: isHovered ? 'none' : `shimmer ${duration} ease-in-out infinite`,
                // When hovered, we unset these so standard CSS (like group-hover:text-primary) can take over.
                // When Not hovered, we enforce transparent text to show the background gradient.
                WebkitBackgroundClip: isHovered ? 'unset' : 'text',
                WebkitTextFillColor: isHovered ? 'unset' : '',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {children}
        </span>
    )
}
    