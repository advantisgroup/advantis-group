'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'

export const Header = () => {
    const [isScrolled, setIsScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            const shouldBeScrolled = mobileMenuOpen || window.scrollY > 50
            setIsScrolled(shouldBeScrolled)
        }

        handleScroll()
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [mobileMenuOpen])

    const navLinks = [
        {
            label: 'Über uns',
            path: '/uber-uns',
        },
        {
            label: 'Unsere Marken',
            path: '/unsere-marken',
        },
        {
            label: 'Team',
            path: '/team',
        },
        {
            label: 'Kontakt',
            path: '/kontakt',
        },
    ]

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 ${!isScrolled ? '' : 'border-b border-border '}`}
        >
            <nav className="container mx-auto flex items-center justify-between h-16 px-4">
                <Link href="/" className="group flex items-center gap-1 font-semibold text-lg">
                    <span className="group-hover:text-advantis duration-300">ADVANTIS</span>
                    <span className="text-foreground">GROUP</span>
                </Link>

                <ul className="hidden md:flex items-center gap-6 text-sm">
                    {navLinks.map((link, i) => (
                        <li key={`${link.label}_${i}`}>
                            <Link
                                href={link.path}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {link.label}
                            </Link>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2"
                    aria-label="Toggle menu"
                >
                    <div className="space-y-1.5">
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-transform ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}
                        />
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-opacity ${mobileMenuOpen ? 'opacity-0' : ''}`}
                        />
                        <span
                            className={`block h-0.5 w-6 bg-foreground transition-transform ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}
                        />
                    </div>
                </button>
            </nav>

            {mobileMenuOpen && (
                <div className="md:hidden border-t border-border bg-background">
                    <ul className="container mx-auto px-4 py-4 space-y-4">
                        {navLinks.map((link, i) => (
                            <li key={`mobile_${link.label}_${i}`}>
                                <Link
                                    href={link.path}
                                    className="block text-sm text-muted-foreground hover:text-foreground"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </header>
    )
}
