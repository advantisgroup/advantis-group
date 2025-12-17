import type React from 'react'

import { type LucideIcon } from 'lucide-react'
import { type z } from 'zod'

import { type FormDataSchema } from '@/lib/schema'

export type FormData = z.infer<typeof FormDataSchema>
export type ContactMode = 'message' | 'callback'
export type ButtonState = 'idle' | 'loading' | 'success' | 'error'

export interface ContactInfoItem {
    icon: LucideIcon
    label: string
    value: string
    href: string
}

export interface CallbackFormProps {
    buttonState: ButtonState
    onSubmit: (e: React.FormEvent) => void
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

export interface WhyAdvantisSidebarProps {
    contactMode: ContactMode
}

export interface TabNavigationProps {
    contactMode: ContactMode
    onModeChange: (mode: ContactMode) => void
}
