/* eslint-disable no-console */
'use client'
import React, { useState } from 'react'

import { Mail, Phone, MapPin, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import posthog from 'posthog-js'
import { toast } from 'sonner'
import { z } from 'zod'

import { CallbackForm } from '@/components/contact/CallbackForm'
import { ContactInfoDesktop, ContactInfoMobile } from '@/components/contact/ContactInfo'
import { MessageForm } from '@/components/contact/MessageForm'
import { TabNavigation } from '@/components/contact/TabNavigation'
import { WhyAdvantisSidebar } from '@/components/contact/WhyAdvantis'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'
import { api } from '@/lib/eden'
import { FormDataSchema } from '@/lib/schema'
import { type ButtonState, type ContactInfoItem, type ContactMode, type FormData } from '@/types/contact'

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
            value: 'touch@advantisgroup.de',
            href: 'mailto:touch@advantisgroup.de',
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
        await sendEmail(e, 'message')
    }

    const handleCallbackSubmit = async (e: React.FormEvent) => {
        await sendEmail(e, 'callback')
    }

    const sendEmail = async (e: React.FormEvent, type: ContactMode) => {
        e.preventDefault()
        setButtonState('loading')
        posthog.capture(`User - ${type} Submitted`)

        setFormData({
            company: formData.company,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            message: formData.message,
            phone: formData.phone,
            mode: type,
        })

        console.log(formData)

        const result = FormDataSchema.safeParse(formData)

        if (!result.success) {
            const flatten = z.treeifyError(result.error)
            setErrors(flatten.errors as z.ZodFlattenedError<FormData>['fieldErrors'])
            setButtonState('error')

            console.log(result)

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

        try {
            const response = await api.send.post({
                ...formData,
                adresses: [process.env.NEXT_PUBLIC_EMAIL_ADRESS!],
                cc: [formData.email],
                subject: `User Request - ${formData.mode}`,
            })

            console.log(response)

            if (response.status === 500) {
                setButtonState('error')
                return toast.error(tMessages('errorTitle'), {
                    description: 'Falls das Problem anhält versuchen sie es später nochmal',
                    icon: <X />,
                })
            } else if (response.status === 429) {
                setButtonState('error')
                return toast.error('Rate Limit', {
                    description: 'Sie haben zu viele Anfragen geschickt. Versuchen sie es später nochmal',
                    icon: <X />,
                })
            } else {
                setButtonState('success')
                toast.success(tMessages('successTitle'), {
                    description: tMessages('successDesc'),
                })
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            console.log(error)
            setButtonState('error')

            toast.error(tMessages('errorTitle'), {
                description: 'Falls das Problem anhält versuchen sie es später nochmal',
                icon: <X />,
            })
        }
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
