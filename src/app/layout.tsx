import React from 'react'

import { Outfit, Manrope } from 'next/font/google'

import { type Metadata } from 'next'

import './global.css'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
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
    title: 'Advantis Group GmbH',
    description:
        'Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.',
    openGraph: {
        type: 'website',
        url: 'https://advantis-group.de',
        title: 'Advantis Group GmbH',
        description: 'Ihre Heimat für exzellenten Vertrieb',
        siteName: 'Advantis Group',
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="de" suppressHydrationWarning>
            <body className={`bg-background antialiased ${manrope.variable} ${outfit.variable}`}>
                <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
                    <Header />
                    {children}
                    <Toaster />
                    <Footer />
                </ThemeProvider>
            </body>
        </html>
    )
}
