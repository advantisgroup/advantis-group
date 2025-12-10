'use client'

import * as React from 'react'

import { useTheme } from 'next-themes'

// Returns the path to the logo, preferred for the current theme
export function useBrandLogo(): string {
    const { theme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    // Return base logo during SSR and before mount to prevent hydration mismatch
    if (!mounted) {
        return '/base_logo_transparent_background.png'
    }

    if (theme === 'dark') {
        return '/white_logo_transparent_background.png'
    }

    if (theme === 'system') {
        return '/base_logo_transparent_background.png'
    }

    return '/black_logo_transparent_background.png'
}

export function useSingleLetterLogo(): string {
    const { theme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return '/base_logo_tb_First.png'
    }

    if (theme === 'dark') {
        return '/white_logo_tb_First.png'
    }

    // specific check for system to match requirement, though fallback covers it
    if (theme === 'system') {
        return '/base_logo_tb_First.png'
    }

    return '/base_logo_tb_First.png'
}
