import React from 'react'

import { Outfit, Manrope } from 'next/font/google'

import { type Metadata } from 'next'

import './global.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'

const outfit = Outfit({
    subsets: ['latin'],
    variable: '--font-outfit',
    display: 'swap',
})

const manrope = Manrope({
    subsets: ['latin'],
    variable: '--font-manrope',
    display: 'swap',
})

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
    title: {
        default: 'Advantis Group GmbH',
        template: '%s | Advantis Group GmbH',
    },
    description:
        'Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.',
    keywords: [
        'Sales',
        'Vertrieb',
        'Marketing',
        'Leadgenerierung',
        'Akquise',
        'Sales Training',
        'KI-Tools',
        'Advantis Group',
        'Marketingstrategie',
    ],
    authors: [{ name: 'Advantis Group GmbH' }],
    creator: 'Advantis Group GmbH',
    metadataBase: new URL('https://advantis-group.de'),
    openGraph: {
        type: 'website',
        locale: 'de_DE',
        url: 'https://advantis-group.de',
        title: 'Advantis Group GmbH',
        description:
            'Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.',
        siteName: 'Advantis Group GmbH',
        images: [
            {
                url: '/base_logo_transparent_background.png',
                width: 1200,
                height: 630,
                alt: 'Advantis Group GmbH Logo',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Advantis Group GmbH',
        description:
            'Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.',
        images: ['/base_logo_transparent_background.png'],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon-16x16.png',
        apple: '/apple-touch-icon.png',
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html suppressHydrationWarning>
            <body className={`bg-background antialiased scroll-smooth ${manrope.variable} ${outfit.variable}`}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {children}
                    <Toaster />
                </ThemeProvider>
            </body>
        </html>
    )
}
