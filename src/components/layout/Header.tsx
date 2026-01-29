'use client'

import React from 'react'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { useTranslations } from 'next-intl'

import { useSingleLetterLogo } from '@/hooks/use-logo'
import { useIsMobile } from '@/hooks/use-mobile'
import { Link } from '@/i18n/navigation'

import { SettingsMenu } from './SettingsMenu'
import { ShimmerText } from '../effects/Shimmer'

export const Header = () => {
    const pathname = usePathname()
    const logo = useSingleLetterLogo()
    const isMobile = useIsMobile()
    const t = useTranslations('nav')

    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
    const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 })

    const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePosition({
            x: e.clientX - rect.left - rect.width / 2,
            y: e.clientY - rect.top - rect.height / 2,
        })
    }

    const navLinks = [
        {
            label: t('about'),
            path: '/about',
        },
        {
            label: t('brands'),
            path: '/brands',
        },
        {
            label: t('team'),
            path: '/team',
        },
        {
            label: t('contact'),
            path: '/contact',
        },
    ]

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 transition-all duration-300 'border-b border-border shadow-sm`}
        >
            <nav className="container mx-auto flex items-center justify-between h-16 px-4">
                {!isMobile ? (
                    <Link
                        href="/"
                        className="group relative flex items-center gap-1 font-bold text-lg font-sans"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
                        style={{
                            transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
                            transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        }}
                    >
                        <div className="relative w-8 h-8 mr-1">
                            <Image src={logo} alt="Advantis Logo" fill className="object-contain" sizes="32px" />
                        </div>
                        <ShimmerText duration="8s" className="group-hover:text-advantis transition-colors duration-300">
                            ADVANTIS
                        </ShimmerText>
                        <ShimmerText
                            duration="6s"
                            className="group-hover:text-foreground transition-colors duration-300"
                        >
                            GROUP
                        </ShimmerText>
                    </Link>
                ) : (
                    <Link
                        href="/"
                        className="group relative flex items-center gap-1 font-bold text-lg font-sans"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setMousePosition({ x: 0, y: 0 })}
                        style={{
                            transform: `translate(${mousePosition.x * 0.18}px, ${mousePosition.y * 0.18}px)`,
                            transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        }}
                    >
                        <div className="relative w-8 h-8 mr-1">
                            <Image src={logo} alt="Advantis Logo" fill className="object-contain" sizes="32px" />
                        </div>
                        <ShimmerText className="group-hover:text-advantis transition-colors duration-500">
                            ADVANTIS
                        </ShimmerText>
                        <ShimmerText className="group-hover:text-foreground transition-colors duration-500">
                            GROUP
                        </ShimmerText>
                    </Link>
                )}

                <div className="hidden md:flex items-center gap-4">
                    <ul className="flex items-center gap-6 text-sm">
                        {navLinks.map((link, i) => (
                            <li key={`${link.label}_${i}`}>
                                <Link
                                    href={link.path}
                                    className={`relative transition-colors group/link ${pathname === link.path
                                            ? 'text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    <span className="relative z-10">{link.label}</span>
                                    {/* Animated underline */}
                                    <span
                                        className={`absolute bottom-0 left-0 h-[2px] bg-linear-to-r from-advantis to-advantis/50 transition-all duration-300 ease-out ${pathname === link.path ? 'w-full' : 'w-0 group-hover/link:w-full'
                                            }`}
                                    />
                                    {/* Subtle glow on hover */}
                                    <span className="absolute inset-0 opacity-0 group-hover/link:opacity-100 transition-opacity duration-300 blur-sm bg-advantis/5" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <SettingsMenu />
                </div>

                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 relative group/menu"
                    aria-label="Toggle menu"
                >
                    {/* Subtle hover glow */}
                    <div className="absolute inset-0 opacity-0 group-hover/menu:opacity-100 transition-opacity duration-300 blur-md bg-advantis/10 rounded-full" />

                    <div className="space-y-1.5 relative z-10">
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : 'group-hover/menu:w-5'}`}
                        />
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : 'group-hover/menu:bg-advantis'}`}
                        />
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : 'group-hover/menu:w-4'}`}
                        />
                    </div>
                </button>
            </nav>

            {mobileMenuOpen && (
                <div className="md:hidden border-t border-border bg-background animate-in slide-in-from-top-2 duration-300">
                    <div className="container mx-auto px-4 py-4 space-y-4">
                        <ul className="space-y-4">
                            {navLinks.map((link, i) => (
                                <li
                                    key={`mobile_${link.label}_${i}`}
                                    className="animate-in slide-in-from-left-2 duration-300"
                                    style={{ animationDelay: `${i * 50}ms` }}
                                >
                                    <Link
                                        href={link.path}
                                        className={`block text-sm hover:text-foreground hover:translate-x-1 transition-all duration-200 ${pathname === link.path
                                                ? 'text-foreground font-medium translate-x-1'
                                                : 'text-muted-foreground'
                                            }`}
                                        onClick={() => setMobileMenuOpen(false)}
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>

                        {/* Settings Section */}
                        <div
                            className="pt-4 border-t border-border animate-in slide-in-from-left-2 duration-300"
                            style={{ animationDelay: `${navLinks.length * 50}ms` }}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    {t('settings') || 'Settings'}
                                </span>
                                <SettingsMenu />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </header>
    )
}
