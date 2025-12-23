import { Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { type MessageFormProps } from '@/types/contact'

import { BrandText } from '../effects/BrandText'
import { AnimatedButton } from '../ui/AnimatedButton'

export function MessageForm({ formData, errors, buttonState, isMobile, onFormDataChange, onSubmit }: MessageFormProps) {
    const t = useTranslations('contact.form')

    return (
        <form className="space-y-4" onSubmit={onSubmit}>
            <div>
                <label htmlFor="company" className="block text-sm font-medium mb-2">
                    {t('company')}
                </label>
                <input
                    type="text"
                    id="company"
                    value={formData.company}
                    onChange={(e) => onFormDataChange({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
                {errors.company && <p className="text-red-500 text-sm mt-1">{errors.company[0]}</p>}
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/2">
                    <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                        {t('firstName')}
                    </label>
                    <input
                        type="text"
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => onFormDataChange({ ...formData, firstName: e.target.value })}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    />
                    {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName[0]}</p>}
                </div>
                <div className="w-full md:w-1/2">
                    <label htmlFor="lastName" className="block text-sm font-medium mb-2">
                        {t('lastName')}
                    </label>
                    <input
                        type="text"
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    />
                    {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName[0]}</p>}
                </div>
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                    {t('email')}
                </label>
                <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email[0]}</p>}
            </div>

            <div>
                <label htmlFor="phone" className="block text-sm font-medium mb-2">
                    {t('phone')}
                </label>
                <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
            </div>

            <div>
                <label htmlFor="message" className="block text-sm font-medium mb-2">
                    {t('message')}
                </label>
                <textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => onFormDataChange({ ...formData, message: e.target.value })}
                    rows={isMobile ? 4 : 6}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-base"
                />
                {errors.message && <p className="text-red-500 text-sm mt-1">{errors.message[0]}</p>}
            </div>

            <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                    <strong>{t('privacyNoteLabel')}</strong> {t('privacyPrefix')}{' '}
                    <BrandText brand="advantis">Advantis Group GmbH</BrandText> {t('privacySuffix')}{' '}
                    <Link href="/datenschutz" className="underline hover:text-foreground">
                        {t('privacyLink')}
                    </Link>
                </p>
                <AnimatedButton buttonState={buttonState} idleText={t('submit')} idleIcon={Send} />
            </div>
        </form>
    )
}
