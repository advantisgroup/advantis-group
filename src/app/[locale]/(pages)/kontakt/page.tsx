'use client'
import React, { useState } from 'react'

import { Mail, Phone, MapPin, Send, X, Check, Loader2, MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import posthog from 'posthog-js'
import { toast } from 'sonner'
import { z } from 'zod'

import { BrandText } from '@/components/effects/BrandText'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'
import { Link } from '@/i18n/navigation'
import { FormDataSchema } from '@/lib/schema'
import { cn } from '@/lib/utils'

type FormData = z.infer<typeof FormDataSchema>
type ContactMode = 'message' | 'callback'
type ButtonState = 'idle' | 'loading' | 'success' | 'error'

interface ContactInfoItem {
    icon: typeof Mail
    label: string
    value: string
    href: string
}

function ContactInfoMobile({ items }: { items: ContactInfoItem[] }) {
    return (
        <div className="space-y-4">
            {items.map((info) => {
                const Icon = info.icon
                return (
                    <Link
                        key={info.label}
                        href={info.href}
                        className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-foreground/40 transition-colors"
                    >
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-muted-foreground">{info.label}</p>
                            <p className="text-base text-foreground wrap-break-word">{info.value}</p>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}

function ContactInfoDesktop({ items }: { items: ContactInfoItem[] }) {
    return (
        <div className="border border-border overflow-hidden rounded-t-lg">
            <div className="grid md:grid-cols-3 divide-x divide-border">
                {items.map((info) => {
                    const Icon = info.icon
                    return (
                        <Card key={info.label} className="border-0 rounded-none">
                            <CardHeader style={{ paddingBottom: '0px' }}>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                        <Icon className="w-4 h-4 text-primary" />
                                    </div>
                                    {info.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Link
                                    href={info.href}
                                    className="text-muted-foreground hover:text-foreground transition-colors wrap-break-word"
                                >
                                    {info.value}
                                </Link>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

interface TabNavigationProps {
    contactMode: ContactMode
    onModeChange: (mode: ContactMode) => void
}

function TabNavigation({ contactMode, onModeChange }: TabNavigationProps) {
    const t = useTranslations('contact.tabs')

    return (
        <div className="border-b border-border bg-muted/30">
            <div className="flex">
                <button
                    onClick={() => onModeChange('message')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative',
                        contactMode === 'message'
                            ? 'text-foreground bg-card'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                >
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('writeMessage')}</span>
                    <span className="sm:hidden">{t('writeMessageShort')}</span>
                    {contactMode === 'message' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button
                    onClick={() => onModeChange('callback')}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative border-l border-border',
                        contactMode === 'callback'
                            ? 'text-foreground bg-card'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                >
                    <Phone className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('requestCallback')}</span>
                    <span className="sm:hidden">{t('requestCallbackShort')}</span>
                    {contactMode === 'callback' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                </button>
            </div>
        </div>
    )
}

interface AnimatedButtonProps {
    buttonState: ButtonState
    idleText: string
    idleIcon: typeof Send
    type?: 'submit' | 'button'
    disabled?: boolean
}

function AnimatedButton({
    buttonState,
    idleText,
    idleIcon: IdleIcon,
    type = 'submit',
    disabled = false,
}: AnimatedButtonProps) {
    return (
        <Button type={type} disabled={disabled} className="w-full relative overflow-hidden">
            <span className="relative flex items-center justify-center gap-2">
                {!(buttonState === 'loading') && idleText}

                {/* Idle Icon - flies away when transitioning */}
                <span
                    className={`inline-flex transition-all duration-500 ${
                        buttonState === 'idle' ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'
                    }`}
                >
                    <IdleIcon className="w-4 h-4" />
                </span>

                {/* Loading Spinner */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'loading'
                            ? 'translate-x-0 opacity-100 scale-100'
                            : buttonState === 'idle'
                              ? '-translate-x-12 opacity-0 scale-50'
                              : 'translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <Loader2 className="w-4 h-4 animate-spin" />
                </span>

                {/* Success Checkmark */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'success'
                            ? 'translate-x-0 opacity-100 scale-100'
                            : '-translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <Check className="w-5 h-5" />
                </span>

                {/* Error X with shake animation */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'error'
                            ? 'translate-x-0 opacity-100 scale-100 animate-shake'
                            : '-translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <X className="w-5 h-5" />
                </span>
            </span>
        </Button>
    )
}

interface MessageFormProps {
    formData: FormData
    errors: z.ZodFlattenedError<FormData>['fieldErrors']
    buttonState: ButtonState
    isMobile: boolean
    onFormDataChange: (data: FormData) => void
    onSubmit: (e: React.FormEvent) => void
}

function MessageForm({ formData, errors, buttonState, isMobile, onFormDataChange, onSubmit }: MessageFormProps) {
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
                    <BrandText brand="advantis">Advantis-group GmbH</BrandText> {t('privacySuffix')}{' '}
                    <Link href="/datenschutz" className="underline hover:text-foreground">
                        {t('privacyLink')}
                    </Link>
                </p>
                <AnimatedButton buttonState={buttonState} idleText={t('submit')} idleIcon={Send} disabled={true} />
            </div>
        </form>
    )
}

interface CallbackFormProps {
    buttonState: ButtonState
    onSubmit: (e: React.FormEvent) => void
}

function CallbackForm({ buttonState, onSubmit }: CallbackFormProps) {
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
                    <BrandText brand="advantis">Advantis-group GmbH</BrandText> {t('privacySuffixCallback')}{' '}
                    <Link href="/datenschutz" className="underline hover:text-foreground">
                        {t('privacyLink')}
                    </Link>
                </p>
                <AnimatedButton
                    buttonState={buttonState}
                    idleText={t('callbackRequest')}
                    idleIcon={Phone}
                    disabled={true}
                />
            </div>
        </form>
    )
}

interface WhyAdvantisSidebarProps {
    contactMode: ContactMode
}

function WhyAdvantisSidebar({ contactMode }: WhyAdvantisSidebarProps) {
    const t = useTranslations('contact.sidebar')

    return (
        <Card className="border-0 rounded-none">
            <CardHeader>
                <CardTitle className="text-xl md:text-2xl">
                    {t('title')} <BrandText brand="advantis">Advantis Group</BrandText>?
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <CardDescription className="text-base">{t('description1')}</CardDescription>
                <CardDescription className="text-base">
                    {contactMode === 'message' ? t('descriptionMessage') : t('descriptionCallback')}
                </CardDescription>
                <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                        {contactMode === 'message' ? t('closingMessage') : t('closingCallback')}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}

export default function Kontakt() {
    const t = useTranslations('contact')
    const tMessages = useTranslations('contact.messages')

    const isMobile = useIsMobile()
    const [contactMode, setContactMode] = useState<ContactMode>('message')
    const [buttonState, setButtonState] = useState<ButtonState>('idle')
    const [callbackButtonState, setCallbackButtonState] = useState<ButtonState>('idle')
    const [formData, setFormData] = useState<FormData>({
        company: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        message: '',
        mode: '',
    })
    const [errors, setErrors] = useState<z.ZodFlattenedError<FormData>['fieldErrors']>({})

    const contactInfoData: ContactInfoItem[] = [
        {
            icon: Mail,
            label: t('email'),
            value: 'touch@advantis-group.de',
            href: 'mailto:touch@advantis-group.de',
        },
        {
            icon: Phone,
            label: t('phone'),
            value: '[folgt]',
            href: 'tel:',
        },
        {
            icon: MapPin,
            label: t('address'),
            value: 'Bienweg 8, 90425 Nürnberg',
            href: '#',
        },
    ]

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setButtonState('loading')
        posthog.capture('User - Message Submitted')

        const result = FormDataSchema.safeParse(formData)

        if (!result.success) {
            const flatten = z.treeifyError(result.error)
            setErrors(flatten.errors as z.ZodFlattenedError<FormData>['fieldErrors'])
            setButtonState('error')

            toast.error(tMessages('errorTitle'), {
                description: tMessages('errorDesc'),
                icon: <X />,
            })

            setTimeout(() => {
                setButtonState('idle')
            }, 3000)
            return
        }

        setErrors({})
        setFormData({
            company: formData.company,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            message: formData.message,
            phone: formData.phone,
            mode: 'message',
        })

        const res = await fetch('api/db/saveContact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        })
        const data = (await res.json()) as { success: boolean }

        if (!data.success) {
            setButtonState('error')
            if (res.status === 429) {
                toast.error('Rate Limit', {
                    description: 'Sie haben zu viele Anfragen geschickt. Versuchen sie es spater nochmal',
                    icon: <X />,
                })
            } else {
                toast.error(tMessages('errorTitle'), {
                    description: 'Fals das problem anhalt versuchen sie es spater nochmal',
                    icon: <X />,
                })
            }
        } else {
            setButtonState('success')
            toast.success(tMessages('successTitle'), {
                description: tMessages('successDesc'),
            })
        }

        setTimeout(() => {
            setButtonState('idle')
        }, 3000)
    }

    const handleCallbackSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setCallbackButtonState('loading')
        posthog.capture('User - Callback Submitted')

        await new Promise((resolve) => setTimeout(resolve, 1500))

        setCallbackButtonState('success')
        toast.success(tMessages('callSuccessTitle'), {
            description: tMessages('callSuccessDesc'),
        })

        setTimeout(() => {
            setCallbackButtonState('idle')
        }, 3000)
    }

    return (
        <div className="min-h-screen">
            <main className="container mx-auto px-4 pt-24 pb-24 space-y-16 md:space-y-24">
                {/* Hero Section */}
                <section className="max-w-4xl mx-auto space-y-6 md:space-y-8 text-center">
                    <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold">{t('title')}</h1>
                    <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
                </section>

                {/* Contact Section */}
                <section className="max-w-6xl mx-auto space-y-8 md:space-y-12">
                    {/* Contact Info Cards */}
                    {isMobile ? (
                        <ContactInfoMobile items={contactInfoData} />
                    ) : (
                        <ContactInfoDesktop items={contactInfoData} />
                    )}

                    {/* Contact Form Container */}
                    <div className="border border-border rounded-b-lg overflow-hidden">
                        <TabNavigation contactMode={contactMode} onModeChange={setContactMode} />

                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2 divide-x'} divide-border`}>
                            <Card className={`border-0 rounded-none ${isMobile ? 'border-b' : ''}`}>
                                <CardHeader>
                                    <CardTitle className="text-xl md:text-2xl">
                                        {contactMode === 'message' ? tMessages('writeUs') : tMessages('callback')}
                                    </CardTitle>
                                    <CardDescription>
                                        {contactMode === 'message'
                                            ? tMessages('writeUsDesc')
                                            : tMessages('callbackDesc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {contactMode === 'message' ? (
                                        <MessageForm
                                            formData={formData}
                                            errors={errors}
                                            buttonState={buttonState}
                                            isMobile={isMobile}
                                            onFormDataChange={setFormData}
                                            onSubmit={handleSubmit}
                                        />
                                    ) : (
                                        <CallbackForm
                                            buttonState={callbackButtonState}
                                            onSubmit={handleCallbackSubmit}
                                        />
                                    )}
                                </CardContent>
                            </Card>

                            <WhyAdvantisSidebar contactMode={contactMode} />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
