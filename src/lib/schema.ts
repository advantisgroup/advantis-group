import { z } from 'zod'

export const FormDataSchema = z.object({
    company: z.string().min(1, 'Company is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.email('Invalid email address'),
    phone: z.string().optional(),
    message: z.string().min(1, 'Message is required'),
    mode: z.string().min(1, 'Mode is required'),
})

export const OtherFormDataSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional(),
    email: z.email('Invalid email address'),
    phone: z.string().optional(),
    topic: z.enum(['withdrawal', 'question', 'legal'], {
        message: 'Please select a topic',
    }),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(1, 'Message is required'),
    mode: z.string().min(1, 'Mode is required'),
})

export const CallbackFormDataSchema = z.object({
    company: z.string().min(1, 'Company is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    phone: z.string().min(1, 'Phone is required'),
    email: z.email('Invalid email address'),
    dateTime: z.string().min(1, 'Date/time is required'),
    notes: z.string().optional(),
})
