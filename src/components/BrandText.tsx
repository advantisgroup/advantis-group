'use client'
import { cn } from '@/lib/utils'

interface BrandTextProps {
    brand?: 'salespirates' | 'advantis' | 'rodeo' | 'oldschool-train' | 'sales-ai-germany' | string
    children: string
    className?: string
    hoverable?: boolean
    keepRestColor?: boolean
    groupHover?: boolean
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
    const config = brand && BRAND_CONFIGS[brand as keyof typeof BRAND_CONFIGS]

    let firstPart: string
    let rest: string
    let color: string
    let hoverColor: string

    if (config) {
        ;[firstPart, rest] = config.split(children)
        color = config.color
        hoverColor = config.hoverColor
    } else {
        const spaceIndex = children.indexOf(' ')
        if (spaceIndex === -1) {
            firstPart = children
            rest = ''
        } else {
            firstPart = children.substring(0, spaceIndex)
            rest = children.substring(spaceIndex)
        }

        const brandClass = brand
            ? brand.toLowerCase().replace(/\s+/g, '')
            : children
              ? children.toLowerCase().replace(/\s+/g, '')
              : ''
        color = brandClass ? `text-${brandClass}` : ''
        hoverColor = brandClass ? (groupHover ? `group-hover:text-${brandClass}` : `hover:text-${brandClass}`) : ''

        console.log(brandClass, color, hoverColor)
    }

    return (
        <span className={cn(className, hoverable && 'group cursor-pointer inline-block')}>
            <span className={cn(className, 'transition-colors duration-300', hoverable ? cn(hoverColor) : '')}>
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
