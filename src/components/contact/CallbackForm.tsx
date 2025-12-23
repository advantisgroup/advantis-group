import { Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { type CallbackFormProps } from '@/types/contact'

import { BrandText } from '../effects/BrandText'
import { AnimatedButton } from '../ui/AnimatedButton'

export function CallbackForm({ buttonState, onSubmit }: CallbackFormProps) {
    const t = useTranslations('contact.form')

    return (
        <form className="space-y-4" onSubmit={onSubmit}>
            <div>
                <label htmlFor="callback-company" className="block text-sm font-medium mb-2">
                    {t('company')}*
                </label>
                <input
                    type="text"
                    id="callback-company"
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    required
                />
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/2">
                    <label htmlFor="callback-firstName" className="block text-sm font-medium mb-2">
                        {t('firstName')}*
                    </label>
                    <input
                        type="text"
                        id="callback-firstName"
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                        required
                    />
                </div>
                <div className="w-full md:w-1/2">
                    <label htmlFor="callback-lastName" className="block text-sm font-medium mb-2">
                        {t('lastName')}*
                    </label>
                    <input
                        type="text"
                        id="callback-lastName"
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                        required
                    />
                </div>
            </div>

            <div>
                <label htmlFor="callback-phone" className="block text-sm font-medium mb-2">
                    {t('phone')}*
                </label>
                <input
                    type="tel"
                    id="callback-phone"
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    placeholder={t('phonePlaceholder')}
                    required
                />
            </div>

            <div>
                <label htmlFor="callback-email" className="block text-sm font-medium mb-2">
                    {t('email')}*
                </label>
                <input
                    type="email"
                    id="callback-email"
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    required
                />
                <p className="text-xs text-muted-foreground mt-1">{t('callbackEmailNote')}</p>
            </div>

            <div>
                <label htmlFor="callback-datetime" className="block text-sm font-medium mb-2">
                    {t('desiredTime')}*
                </label>
                <input
                    type="datetime-local"
                    id="callback-datetime"
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    required
                />
                <p className="text-xs text-muted-foreground mt-1">{t('callbackTimeNote')}</p>
            </div>

            <div>
                <label htmlFor="callback-notes" className="block text-sm font-medium mb-2">
                    {t('notes')}
                </label>
                <textarea
                    id="callback-notes"
                    rows={3}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-base"
                    placeholder={t('notesPlaceholder')}
                />
            </div>

            <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                    <strong>{t('privacyNoteLabel')}</strong> {t('privacyPrefix')}{' '}
                    <BrandText brand="advantis">Advantis Group GmbH</BrandText> {t('privacySuffixCallback')}{' '}
                    <Link href="/datenschutz" className="underline hover:text-foreground">
                        {t('privacyLink')}
                    </Link>
                </p>
                <AnimatedButton buttonState={buttonState} idleText={t('callbackRequest')} idleIcon={Phone} />
            </div>
        </form>
    )
}
