import { Inter } from 'next/font/google'

import './global.css'
import { type Metadata } from 'next'

import GlobalNotFoundClient from '@/components/GlobalNotFoundClient'

const inter = Inter({ subsets: ['latin'] })

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
    title: '404 - Page Not Found',
    description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
    return (
        <html lang="en" className={inter.className}>
            <body>
                <GlobalNotFoundClient />
            </body>
        </html>
    )
}
