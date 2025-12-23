import createMiddleware from 'next-intl/middleware'

import { locales, defaultLocale } from './i18n/request'

export default createMiddleware({
    locales,
    defaultLocale,
    localePrefix: 'always',
    localeDetection: true,
})

export const config = {
    matcher: ['/', '/(de|en|zh|fr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
}
