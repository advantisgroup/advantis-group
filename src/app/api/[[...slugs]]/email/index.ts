import { Elysia, t } from 'elysia'
import { Resend } from 'resend'

import { EmailTemplate } from '@/components/email/email-template'

const resend = new Resend(process.env.RESEND_API_KEY)

export const email = new Elysia().post(
    '/send',
    async ({ body, set }) => {
        const { firstName, lastName, adresses, cc, bcc, subject, message } = body
        try {
            const { data, error } = await resend.emails.send({
                from: `Advantis Group <${process.env.NEXT_PUBLIC_EMAIL_ADRESS}>`,
                to: adresses,
                bcc: bcc,
                cc: cc,
                subject: subject,
                react: EmailTemplate({ firstName, lastName, message }),
            })
            if (error) {
                set.status = 500
                return {
                    error: error.message || 'Failed to send email',
                }
            }
            if (!data || !data.id) {
                set.status = 500
                return {
                    error: 'Email not sent - no response data',
                }
            }
            return {
                id: data.id,
            }
        } catch (error) {
            set.status = 500
            return {
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            }
        }
    },
    {
        body: t.Object({
            firstName: t.String(),
            lastName: t.String(),
            adresses: t.Array(t.String()),
            cc: t.Optional(t.Array(t.String())),
            bcc: t.Optional(t.Array(t.String())),
            subject: t.String(),
            message: t.String(),
        }),
        response: {
            200: t.Object({
                id: t.String(),
            }),
            500: t.Object({
                error: t.String(),
            }),
        },
    }
)
