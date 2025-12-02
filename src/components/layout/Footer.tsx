'use client'

import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'

import { Mail, Phone, MapPin } from 'lucide-react'

import { BrandText } from '../effects/BrandText'
import { ModeToggle } from '../theme/theme-toggle'

export const Footer = () => {
    const footerRef = useRef<HTMLElement>(null)
    const [scrollProgress, setScrollProgress] = useState(0)

    useEffect(() => {
        const handleScroll = () => {
            if (!footerRef.current) return

            const footerTop = footerRef.current.offsetTop
            const windowHeight = window.innerHeight
            const scrollY = window.scrollY

            // Calculate how far into the footer we've scrolled
            const scrollIntoFooter = scrollY + windowHeight - footerTop
            const footerHeight = footerRef.current.offsetHeight

            // Progress from 0 to 1 as we scroll through the footer
            const progress = Math.min(Math.max(scrollIntoFooter / footerHeight, 0), 1)
            setScrollProgress(progress)
        }

        window.addEventListener('scroll', handleScroll)
        handleScroll() // Initial calculation

        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const footerLinks = [
        {
            label: 'Home',
            path: '/',
        },
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

    const brandLinks = [
        {
            name: 'Salespirates',
            url: 'https://salespirates.de',
        },
        {
            name: 'Rodeo-Consulting',
            url: 'https://rodeoconsulting.de',
        },
        {
            name: 'Oldschool-train',
            url: 'https://oldschool-train.de',
        },
        {
            name: 'Sales-AI-Germany',
            url: 'https://sales-ai-germany.de',
        },
    ]

    // Calculate lift for each letter (last 5 letters lift progressively)
    const getLiftAmount = (index: number, totalLetters: number) => {
        const lettersToLift = 5 // Lift last 5 letters
        const startIndex = totalLetters - lettersToLift

        if (index < startIndex) return 0

        const liftIndex = index - startIndex
        const maxLift = 40 // Maximum pixels to lift
        const liftAmount = ((liftIndex + 1) / lettersToLift) * maxLift * scrollProgress

        return -liftAmount // Negative to lift up
    }

    const companyName = 'ADVANTIS GROUP'
    const letters = companyName.split('')

    return (
        <footer ref={footerRef} className="relative border-t border-white bg-card overflow-hidden">
            {/* Subtle background pattern */}

            <div className="container mx-auto px-4 py-24 relative">
                {/* Large animated company name */}
                <div className="mb-24 overflow-hidden">
                    <div className="text-center mb-4">
                        <p className="text-sm text-muted-foreground">Ihre Heimat für exzellenten Vertrieb</p>
                    </div>
                    <h2 className="text-[11vw] md:text-[12vw] lg:text-[8rem] font-bold leading-none tracking-tighter text-center">
                        {letters.map((letter, index) => (
                            <span
                                key={index}
                                className="inline-block transition-transform duration-300 ease-out"
                                style={{
                                    transform: `translateY(${getLiftAmount(index, letters.length)}px)`,
                                }}
                            >
                                {letter === ' ' ? '\u00A0' : letter}
                            </span>
                        ))}
                    </h2>
                </div>

                {/* Main footer grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-10 mb-12">
                    {/* Company Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Über uns</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> vereint über 15 Jahre
                            Vertriebserfahrung unter einem Dach. Wir bringen Ihren Vertrieb auf das nächste Level.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Navigation</h3>
                        <ul className="space-y-3 text-sm">
                            {footerLinks.map((link, i) => (
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
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Unsere Marken</h3>
                        <ul className="space-y-3 text-sm">
                            {brandLinks.map((brand, i) => (
                                <li key={`${brand.name}_${i}`}>
                                    <Link
                                        href={brand.url}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {brand.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Kontakt</h3>
                        <ul className="space-y-3 text-sm">
                            <li>
                                <Link
                                    href="tel:"
                                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <Phone className="w-4 h-4" />
                                    <span>[folgt]</span>
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="mailto:touch@advantis-group.de"
                                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <Mail className="w-4 h-4" />
                                    <span>touch@advantis-group.de</span>
                                </Link>
                            </li>
                            <li className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                <span>Bienweg 8, 90425 Nürnberg</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-border">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-xs text-muted-foreground">
                            © {new Date().getFullYear().toString()}{' '}
                            <BrandText brand="advantis">Advantis Group</BrandText> GmbH. Alle Rechte vorbehalten.
                        </p>
                        <div className="flex items-center gap-6">
                            <ModeToggle />
                            <Link
                                href="/impressum"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Impressum
                            </Link>
                            <Link
                                href="/datenschutz"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Datenschutz
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    )
}
