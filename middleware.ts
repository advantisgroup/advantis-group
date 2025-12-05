import createMiddleware from 'next-intl/middleware'

import { locales, defaultLocale } from './src/i18n/request'

export default createMiddleware({
    locales,
    defaultLocale,
    localePrefix: 'always',
    localeDetection: true, // Enable automatic locale detection
})

export const config = {
    matcher: ['/', '/(de|en|zh|fr)/:path*', '/((?!_next|_vercel|.*\\..*).*)'],
}
