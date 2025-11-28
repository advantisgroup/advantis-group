'use client'

import React, { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

interface ScrollRevealProps {
    children: React.ReactNode
    className?: string
    delay?: number
    direction?: 'up' | 'down' | 'left' | 'right' | 'none'
    stagger?: boolean
    staggerDelay?: number
    threshold?: number
}

export const ScrollReveal = ({
    children,
    className,
    delay = 0,
    direction = 'up',
    stagger = false,
    staggerDelay = 100,
    threshold = 0.1,
}: ScrollRevealProps) => {
    const [isVisible, setIsVisible] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.unobserve(entry.target)
                }
            },
            {
                threshold,
                rootMargin: '0px 0px -50px 0px',
            }
        )

        if (ref.current) {
            observer.observe(ref.current)
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current)
            }
        }
    }, [threshold])

    const getDirectionClasses = () => {
        if (direction === 'none') return ''

        const baseClasses = 'transition-all duration-700 ease-out'
        const hiddenClasses = {
            up: 'translate-y-8 opacity-0',
            down: '-translate-y-8 opacity-0',
            left: 'translate-x-8 opacity-0',
            right: '-translate-x-8 opacity-0',
        }
        const visibleClasses = 'translate-y-0 translate-x-0 opacity-100'

        return cn(baseClasses, !isVisible && hiddenClasses[direction], isVisible && visibleClasses)
    }

    return (
        <div
            ref={ref}
            className={cn(getDirectionClasses(), className)}
            style={{
                transitionDelay: `${delay}ms`,
            }}
        >
            {stagger && Array.isArray(children)
                ? children.map((child, index) => (
                      <div
                          key={index}
                          className={cn(
                              'transition-all duration-700 ease-out',
                              !isVisible && 'translate-y-8 opacity-0',
                              isVisible && 'translate-y-0 opacity-100'
                          )}
                          style={{
                              transitionDelay: `${delay + index * staggerDelay}ms`,
                          }}
                      >
                          {child}
                      </div>
                  ))
                : children}
        </div>
    )
}
