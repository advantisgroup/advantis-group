'use client'
import React, { isValidElement } from 'react'

import { cn } from '@/lib/utils'

interface BrandTextProps {
    brand?: 'salespirates' | 'advantis' | 'rodeo' | 'oldschool-train' | 'sales-ai-germany'
    children: React.ReactNode
    className?: string
    hoverable?: boolean
    keepRestColor?: boolean
    groupHover?: boolean
}

const extractText = (node: React.ReactNode): string => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string') return node
    if (typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(extractText).join('')
    if (isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode }
        return extractText(props.children)
    }
    return ''
}

const BRAND_CONFIGS = {
    salespirates: {
        split: (name: string) => {
            if (name.includes('Salespirates')) return ['Sales', 'pirates']
            if (name.includes('Sales-')) return name.split(/-(.+)/)
            if (name.includes('Sales ')) return name.split(/ (.+)/)
            return ['Sales', name.replace('Sales', '')]
        },
        color: 'text-salespirates',
        hoverColor: 'group-hover:text-salespirates',
    },
    advantis: {
        split: (name: string) => {
            const match = name.match(/(Advantis|advantis)(.*)/) || []
            return [match[1] || 'Advantis', match[2] || '']
        },
        color: 'text-advantis',
        hoverColor: 'group-hover:text-advantis',
    },
    rodeo: {
        split: (name: string) => {
            const match = name.match(/(Rodeo)(.*)/) || []
            return [match[1] || 'Rodeo', match[2] || '']
        },
        color: 'text-rodeo',
        hoverColor: 'group-hover:text-rodeo',
    },
    'oldschool-train': {
        split: (name: string) => {
            if (name.includes('Oldschool-train')) return ['Oldschool', '-train']
            return ['Oldschool', name.replace('Oldschool', '')]
        },
        color: 'text-oldschool',
        hoverColor: 'group-hover:text-oldschool',
    },
    'sales-ai-germany': {
        split: (name: string) => {
            if (name.includes('Sales-AI-Germany')) {
                return ['Sales-AI', '-Germany']
            }
            if (name.includes('Sales-AI')) {
                return ['Sales-AI', name.replace('Sales-AI', '')]
            }
            return ['Sales-AI', '']
        },
        color: 'text-sales-ai',
        hoverColor: 'group-hover:text-sales-ai',
    },
} as const

export const BrandText = ({
    brand,
    children,
    className,
    hoverable = true,
    keepRestColor = false,
    groupHover = false,
}: BrandTextProps) => {
    const config = brand && BRAND_CONFIGS[brand]

    let firstPart: string
    let rest: string
    let color: string
    let hoverColor: string

    const content = extractText(children)

    if (config) {
        ;[firstPart, rest] = config.split(content)
        color = config.color
        hoverColor = config.hoverColor
    } else {
        const spaceIndex = content.indexOf(' ')
        if (spaceIndex === -1) {
            firstPart = content
            rest = ''
        } else {
            firstPart = content.substring(0, spaceIndex)
            rest = content.substring(spaceIndex)
        }

        const brandClass = brand
            ? brand.toLowerCase().replace(/\s+/g, '')
            : content
              ? content.toLowerCase().replace(/\s+/g, '')
              : ''
        color = brandClass ? `text-${brandClass}` : ''
        hoverColor = brandClass ? (groupHover ? `group-hover:text-${brandClass}` : `hover:text-${brandClass}`) : ''
    }

    return (
        <span className={cn(className, hoverable && 'group cursor-pointer inline-block')}>
            <span className={cn(className, 'transition-colors duration-300', color, hoverable ? cn(hoverColor) : '')}>
                {firstPart}
            </span>
            {rest && (
                <span
                    className={cn(
                        'transition-colors duration-300',
                        hoverable ? (keepRestColor ? '' : 'group-hover:text-foreground') : '',
                        groupHover ? 'group-hover:text-foreground' : ''
                    )}
                >
                    {rest}
                </span>
            )}
        </span>
    )
}
