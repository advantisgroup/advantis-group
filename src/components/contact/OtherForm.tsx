import { Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { type OtherFormProps, type InquiryTopic } from '@/types/contact'

import { BrandText } from '../effects/BrandText'
import { AnimatedButton } from '../ui/AnimatedButton'

export function OtherForm({ formData, errors, buttonState, isMobile, onFormDataChange, onSubmit }: OtherFormProps) {
    const t = useTranslations('contact.form')
    const tOther = useTranslations('contact.otherForm')

    const topics: { value: InquiryTopic; label: string }[] = [
        { value: 'withdrawal', label: tOther('topics.withdrawal') },
        { value: 'question', label: tOther('topics.question') },
        { value: 'legal', label: tOther('topics.legal') },
    ]

    return (
        <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/2">
                    <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                        {t('firstName')} <span className="text-red-500">*</span>
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
                        {t('lastName')} <span className="text-muted-foreground text-xs">({tOther('optional')})</span>
                    </label>
                    <input
                        type="text"
                        id="lastName"
                        value={formData.lastName || ''}
                        onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                    />
                </div>
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                    {t('email')} <span className="text-red-500">*</span>
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
                    {t('phone')} <span className="text-muted-foreground text-xs">({tOther('optional')})</span>
                </label>
                <input
                    type="tel"
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
            </div>

            <div>
                <label htmlFor="topic" className="block text-sm font-medium mb-2">
                    {tOther('topic')} <span className="text-red-500">*</span>
                </label>
                <select
                    id="topic"
                    value={formData.topic || ''}
                    onChange={(e) => onFormDataChange({ ...formData, topic: e.target.value as InquiryTopic })}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                >
                    <option value="">{tOther('selectTopic')}</option>
                    {topics.map((topic) => (
                        <option key={topic.value} value={topic.value}>
                            {topic.label}
                        </option>
                    ))}
                </select>
                {errors.topic && <p className="text-red-500 text-sm mt-1">{errors.topic[0]}</p>}
            </div>

            <div>
                <label htmlFor="subject" className="block text-sm font-medium mb-2">
                    {tOther('subject')} <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => onFormDataChange({ ...formData, subject: e.target.value })}
                    placeholder={tOther('subjectPlaceholder')}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
                {errors.subject && <p className="text-red-500 text-sm mt-1">{errors.subject[0]}</p>}
            </div>

            <div>
                <label htmlFor="message" className="block text-sm font-medium mb-2">
                    {t('message')} <span className="text-red-500">*</span>
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
                    <Link href="/privacy" className="underline hover:text-foreground">
                        {t('privacyLink')}
                    </Link>
                </p>
                <AnimatedButton buttonState={buttonState} idleText={t('submit')} idleIcon={Send} />
            </div>
        </form>
    )
}
