import deMessages from '@/i18n/messages/de.json'
import enMessages from '@/i18n/messages/en.json'
import frMessages from '@/i18n/messages/fr.json'
import zhMessages from '@/i18n/messages/zh.json'

interface EmailTemplateProps {
    firstName: string
    lastName: string
    message: string
    locale?: string
    subject: string
    topic?: string
}

export function EmailTemplate({ firstName, lastName, message, locale = 'de', subject, topic }: EmailTemplateProps) {
    const messages =
        {
            de: deMessages,
            en: enMessages,
            fr: frMessages,
            zh: zhMessages,
        }[locale] || deMessages

    const t = messages.email || deMessages.email

    return (
        <div style={main}>
            <div style={container}>
                <div style={content}>
                    <h1 style={heading}>
                        {t.greeting.replace('{firstName}', firstName).replace('{lastName}', lastName)}
                    </h1>
                    <p style={paragraph}>{t.bodyIntro}</p>
                    <p style={paragraph}>{t.bodyOutro}</p>
                    <div style={divider} />
                    <h2 style={subjectHeading}>
                        <span style={subjectLabel}>{t.subject}:</span> {subject}
                    </h2>
                    {topic && (
                        <h2 style={subjectHeading}>
                            <span style={subjectLabel}>{t.topic}:</span> {topic}
                        </h2>
                    )}
                    <p style={messageLabel}>{t.yourMessage}</p>
                    <p style={messageBox}>{message}</p>
                </div>
                <div style={footer}>
                    <div style={divider} />
                    <p style={footerText}>{t.poweredBy}</p>
                    <img
                        src="https://advantisgroup.de/base_logo_tb_First.png"
                        width="100"
                        alt="First"
                        style={footerLogo}
                    />
                    <p style={copyright}>
                        &copy; {new Date().getFullYear()} Advantis Group GmbH. {t.rightsReserved}
                        <br />
                        <a href="https://advantisgroup.de" style={link}>
                            advantisgroup.de
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
    padding: '40px 0',
}

const container = {
    backgroundColor: '#ffffff',
    border: '1px solid #f0f0f0',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    margin: '0 auto',
    maxWidth: '600px',
    padding: '40px 20px',
}

const content = {
    padding: '0 10px',
}

const heading = {
    color: '#1a1a1a',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '1.3',
    margin: '0 0 20px',
}

const paragraph = {
    color: '#4a4a4a',
    fontSize: '16px',
    lineHeight: '1.6',
    margin: '0 0 20px',
    whiteSpace: 'pre-wrap' as const,
}

const subjectHeading = {
    color: '#1a1a1a',
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 16px',
    lineHeight: '1.3',
}

const subjectLabel = {
    color: '#666666',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '4px',
}

const messageLabel = {
    color: '#1a1a1a',
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 10px',
}

const messageBox = {
    backgroundColor: '#f9f9f9',
    borderRadius: '4px',
    padding: '16px',
    borderLeft: '4px solid #DE5618',
    color: '#4a4a4a',
    fontSize: '16px',
    lineHeight: '1.6',
    margin: '0 0 20px',
    whiteSpace: 'pre-wrap' as const,
}

const footer = {
    textAlign: 'center' as const,
    marginTop: '40px',
}

const divider = {
    borderTop: '1px solid #eaeaea',
    margin: '0 0 30px',
}

const footerText = {
    color: '#888888',
    fontSize: '12px',
    margin: '0 0 10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
}

const footerLogo = {
    display: 'inline-block',
    marginBottom: '20px',
    opacity: '0.8',
}

const copyright = {
    color: '#999999',
    fontSize: '12px',
    lineHeight: '1.5',
    margin: '0',
}

const link = {
    color: '#DE5618', // Advantis Orange approximation
    textDecoration: 'none',
}
