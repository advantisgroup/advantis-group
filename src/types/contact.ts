import type React from 'react'

import { type LucideIcon } from 'lucide-react'
import { type z } from 'zod'

import { type FormDataSchema, type OtherFormDataSchema, type CallbackFormDataSchema } from '@/lib/schema'

export type FormData = z.infer<typeof FormDataSchema>
export type OtherFormData = z.infer<typeof OtherFormDataSchema>
export type CallbackFormData = z.infer<typeof CallbackFormDataSchema>

export type ContactMode = 'message' | 'callback' | 'other'
export type ButtonState = 'idle' | 'loading' | 'success' | 'error'
export type InquiryTopic = 'withdrawal' | 'question' | 'legal'

export interface ContactInfoItem {
    icon: LucideIcon
    label: string
    value: string
    href: string
}

export interface AnimatedButtonProps {
    buttonState: ButtonState
    idleText: string
    idleIcon: LucideIcon
    type?: 'submit' | 'button'
    disabled?: boolean
}

export interface MessageFormProps {
    formData: FormData
    errors: z.ZodFlattenedError<FormData>['fieldErrors']
    buttonState: ButtonState
    isMobile: boolean
    onFormDataChange: (data: FormData) => void
    onSubmit: (e: React.FormEvent) => void
}

export interface CallbackFormProps {
    formData: CallbackFormData
    errors: z.ZodFlattenedError<CallbackFormData>['fieldErrors']
    buttonState: ButtonState
    onFormDataChange: (data: CallbackFormData) => void
    onSubmit: (e: React.FormEvent) => void
}

export interface OtherFormProps {
    formData: OtherFormData
    errors: z.ZodFlattenedError<OtherFormData>['fieldErrors']
    buttonState: ButtonState
    isMobile: boolean
    onFormDataChange: (data: OtherFormData) => void
    onSubmit: (e: React.FormEvent) => void
}

export interface WhyAdvantisSidebarProps {
    contactMode: ContactMode
}

export interface TabNavigationProps {
    contactMode: ContactMode
    onModeChange: (mode: ContactMode) => void
}
