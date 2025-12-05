'use client'

import { usePathname } from 'next/navigation'

import { Globe } from 'lucide-react'
import { useLocale } from 'next-intl'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useRouter } from '@/i18n/navigation'
import { type Locale, locales } from '@/i18n/request'

const languages = [
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
]

export function LanguageSwitcher() {
    const locale = useLocale()
    const router = useRouter()
    const pathname = usePathname()

    const switchLanguage = (newLocale: string) => {
        // Extract the path without the current locale
        // pathname is like "/de/about" or "/en" or "/zh/team"
        const segments = pathname.split('/').filter(Boolean)

        // Remove the first segment if it's a locale
        if (segments && segments.length > 0 && locales.includes(segments[0] as Locale)) {
            segments.shift()
        }

        // Build the new path with the new locale
        const pathWithoutLocale = segments && segments.length > 0 ? `/${segments.join('/')}` : ''
        router.push(`/${newLocale}${pathWithoutLocale}`)
    }

    const currentLanguage = languages.find((lang) => lang.code === locale)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Globe className="h-5 w-5" />
                    <span className="sr-only">Switch language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {languages.map((language) => (
                    <DropdownMenuItem
                        key={language.code}
                        onClick={() => switchLanguage(language.code)}
                        className={
                            language.code === currentLanguage?.code
                                ? ''
                                : language.code === locale
                                  ? 'bg-accent'
                                  : 'bg-accent'
                        }
                    >
                        <span className="mr-2">{language.flag}</span>
                        {language.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
