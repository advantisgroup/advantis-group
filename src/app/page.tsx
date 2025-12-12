import React from 'react'

import { redirect } from 'next/navigation'

export default function RootPage() {
    React.useEffect(() => {
        const locale = window.localStorage.getItem('NEXT_LOCALE')
        if (!locale) {
            redirect('/de')
        }
        redirect(`/${locale}`)
    }, [])
}
