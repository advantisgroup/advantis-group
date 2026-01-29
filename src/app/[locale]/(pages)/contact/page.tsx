'use client'
import React, { useState } from 'react'

import { Mail, Phone, MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CallbackForm } from '@/components/contact/CallbackForm'
import { ContactInfoDesktop, ContactInfoMobile } from '@/components/contact/ContactInfo'
import { MessageForm } from '@/components/contact/MessageForm'
import { OtherForm } from '@/components/contact/OtherForm'
import { TabNavigation } from '@/components/contact/TabNavigation'
import { WhyAdvantisSidebar } from '@/components/contact/WhyAdvantis'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useContactForm } from '@/hooks/use-contact-form'
import { useIsMobile } from '@/hooks/use-mobile'
import { type ContactInfoItem, type ContactMode } from '@/types/contact'

export default function Kontakt() {
    const t = useTranslations('contact')
    const tMessages = useTranslations('contact.messages')
    const isMobile = useIsMobile()

    // UI State for tab navigation
    const [contactMode, setContactMode] = useState<ContactMode>('message')

    // Custom hook handling all form logic
    const {
        formData,
        setFormData,
        otherFormData,
        setOtherFormData,
        callbackFormData,
        setCallbackFormData,
        errors,
        otherErrors,
        callbackErrors,
        getButtonState,
        handleMessageSubmit,
        handleCallbackSubmit,
        handleOtherSubmit,
    } = useContactForm()

    const contactInfoData: ContactInfoItem[] = [
        {
            icon: Mail,
            label: t('email'),
            value: `${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
            href: `mailto:${process.env.NEXT_PUBLIC_EMAIL_ADRESS}`,
        },
        {
            icon: Phone,
            label: t('phone'),
            value: `${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
            href: `tel:${process.env.NEXT_PUBLIC_PHONE_NUMBER}`,
        },
        {
            icon: MapPin,
            label: t('address'),
            value: `${process.env.NEXT_PUBLIC_ADRESS}`,
            href: '#',
        },
    ]

    const getFormTitle = () => {
        switch (contactMode) {
            case 'message':
                return tMessages('writeUs')
            case 'callback':
                return tMessages('callback')
            case 'other':
                return tMessages('otherInquiry')
            default:
                return tMessages('writeUs')
        }
    }

    const getFormDescription = () => {
        switch (contactMode) {
            case 'message':
                return tMessages('writeUsDesc')
            case 'callback':
                return tMessages('callbackDesc')
            case 'other':
                return tMessages('otherInquiryDesc')
            default:
                return tMessages('writeUsDesc')
        }
    }

    const renderForm = () => {
        switch (contactMode) {
            case 'message':
                return (
                    <MessageForm
                        formData={formData}
                        errors={errors}
                        buttonState={getButtonState('message')}
                        disabled={process.env.NODE_ENV === 'production'}
                        onFormDataChange={setFormData}
                        onSubmit={handleMessageSubmit}
                    />
                )
            case 'callback':
                return (
                    <CallbackForm
                        formData={callbackFormData}
                        errors={callbackErrors}
                        disabled={process.env.NODE_ENV === 'production'}
                        buttonState={getButtonState('callback')}
                        onFormDataChange={setCallbackFormData}
                        onSubmit={handleCallbackSubmit}
                    />
                )
            case 'other':
                return (
                    <OtherForm
                        formData={otherFormData}
                        errors={otherErrors}
                        buttonState={getButtonState('other')}
                        disabled={process.env.NODE_ENV === 'production'}
                        isMobile={isMobile}
                        onFormDataChange={setOtherFormData}
                        onSubmit={handleOtherSubmit}
                    />
                )
            default:
                return null
        }
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
                                    <CardTitle className="text-xl md:text-2xl">{getFormTitle()}</CardTitle>
                                    <CardDescription>{getFormDescription()}</CardDescription>
                                </CardHeader>
                                <CardContent>{renderForm()}</CardContent>
                            </Card>

                            <WhyAdvantisSidebar contactMode={contactMode} />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
