/* eslint-disable no-console */
'use client'
import { type FormEvent, useState, useCallback } from 'react'

import { useTranslations } from 'next-intl'
import { type z } from 'zod'

import { FormDataSchema, OtherFormDataSchema, CallbackFormDataSchema } from '@/lib/schema'
import { type FormData, type OtherFormData, type CallbackFormData, type ContactMode } from '@/types/contact'

import { useEmailSubmit } from './use-email-submit'

const initialFormData: FormData = {
    company: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    message: '',
    mode: '',
}

const initialOtherFormData: OtherFormData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    topic: 'question',
    subject: '',
    message: '',
    mode: '',
}

const initialCallbackFormData: CallbackFormData = {
    company: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    dateTime: '',
    notes: '',
}

export function useContactForm() {
    const tMessages = useTranslations('contact.messages')
    const tOtherForm = useTranslations('contact.otherForm')

    // Form data states
    const [formData, setFormData] = useState<FormData>(initialFormData)
    const [otherFormData, setOtherFormData] = useState<OtherFormData>(initialOtherFormData)
    const [callbackFormData, setCallbackFormData] = useState<CallbackFormData>(initialCallbackFormData)

    // Validation errors
    const [errors, setErrors] = useState<z.ZodFlattenedError<FormData>['fieldErrors']>({})
    const [otherErrors, setOtherErrors] = useState<z.ZodFlattenedError<OtherFormData>['fieldErrors']>({})
    const [callbackErrors, setCallbackErrors] = useState<z.ZodFlattenedError<CallbackFormData>['fieldErrors']>({})

    // Email submission hooks for each form type
    const messageSubmit = useEmailSubmit()
    const callbackSubmit = useEmailSubmit()
    const otherSubmit = useEmailSubmit()

    // Get button state by contact mode
    const getButtonState = useCallback(
        (mode: ContactMode) => {
            switch (mode) {
                case 'message':
                    return messageSubmit.buttonState
                case 'callback':
                    return callbackSubmit.buttonState
                case 'other':
                    return otherSubmit.buttonState
                default:
                    return 'idle'
            }
        },
        [messageSubmit.buttonState, callbackSubmit.buttonState, otherSubmit.buttonState]
    )

    // Validation helper
    const validateAndShowError = useCallback(
        <T>(
            schema: z.ZodType<T>,
            data: unknown,
            setErrorsFn: (errors: Record<string, string[] | undefined>) => void,
            setButtonError: () => void
        ): data is T => {
            const result = schema.safeParse(data)

            if (!result.success) {
                const flatten = result.error.flatten()
                setErrorsFn(flatten.fieldErrors as unknown as Record<string, string[] | undefined>)
                setButtonError()

                console.log(result)

                return false
            }

            setErrorsFn({})
            return true
        },
        []
    )

    // Message form submit handler
    const handleMessageSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault()

            const dataToValidate = { ...formData, mode: 'message' }

            if (
                !validateAndShowError(FormDataSchema, dataToValidate, setErrors, () => {
                    messageSubmit.setButtonState('error')
                    messageSubmit.showErrorToast(tMessages('errorDesc'))
                    messageSubmit.resetButtonState()
                })
            ) {
                return
            }

            await messageSubmit.sendEmail(
                {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    message: formData.message,
                    email: formData.email,
                    phone: formData.phone,
                    subject: `User Request - Message`,
                },
                'User - Message Submitted'
            )
        },
        [formData, messageSubmit, validateAndShowError, tMessages]
    )

    // Callback form submit handler
    const handleCallbackSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault()

            if (
                !validateAndShowError(CallbackFormDataSchema, callbackFormData, setCallbackErrors, () => {
                    callbackSubmit.setButtonState('error')
                    callbackSubmit.showErrorToast(tMessages('errorDesc'))
                    callbackSubmit.resetButtonState()
                })
            ) {
                return
            }

            const message = `Rückruf Anfrage\n\nFirma: ${callbackFormData.company}\nGewünschte Zeit: ${callbackFormData.dateTime}\nTelefon: ${callbackFormData.phone}\n\nNotizen:\n${callbackFormData.notes || 'Keine'}`

            await callbackSubmit.sendEmail(
                {
                    firstName: callbackFormData.firstName,
                    lastName: callbackFormData.lastName,
                    message,
                    phone: callbackFormData.phone,
                    email: callbackFormData.email,
                    subject: `User Request - Callback`,
                },
                'User - Callback Submitted'
            )
        },
        [callbackFormData, callbackSubmit, validateAndShowError, tMessages]
    )

    // Other form submit handler
    const handleOtherSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault()

            const dataToValidate = { ...otherFormData, mode: 'other' }

            if (
                !validateAndShowError(OtherFormDataSchema, dataToValidate, setOtherErrors, () => {
                    otherSubmit.setButtonState('error')
                    otherSubmit.showErrorToast(tMessages('errorDesc'))
                    otherSubmit.resetButtonState()
                })
            ) {
                return
            }

            const topicValue = tOtherForm(`topics.${otherFormData.topic}`)

            await otherSubmit.sendEmail(
                {
                    firstName: otherFormData.firstName,
                    lastName: otherFormData.lastName || '',
                    message: otherFormData.message,
                    email: otherFormData.email,
                    phone: otherFormData.phone,
                    subject: otherFormData.subject,
                    topic: topicValue,
                },
                'User - Other Submitted'
            )
        },
        [otherFormData, otherSubmit, validateAndShowError, tMessages, tOtherForm]
    )

    return {
        // Form data
        formData,
        setFormData,
        otherFormData,
        setOtherFormData,
        callbackFormData,
        setCallbackFormData,

        // Errors
        errors,
        otherErrors,
        callbackErrors,

        // Button states
        getButtonState,
        messageButtonState: messageSubmit.buttonState,
        callbackButtonState: callbackSubmit.buttonState,
        otherButtonState: otherSubmit.buttonState,

        // Submit handlers
        handleMessageSubmit,
        handleCallbackSubmit,
        handleOtherSubmit,
    }
}
