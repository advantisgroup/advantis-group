interface EmailTemplateProps {
    firstName: string
    lastName: string
    message: string
}

export function EmailTemplate({ firstName, lastName, message }: EmailTemplateProps) {
    return (
        <div style={main}>
            <div style={container}>
                <div style={content}>
                    <h1 style={heading}>
                        Hallo {firstName} {lastName},
                    </h1>
                    <p style={paragraph}>
                        vielen Dank für Ihre Nachricht. Dies ist eine Kopie der Anfrage, die wir soeben erhalten haben.
                    </p>
                    <p style={paragraph}>
                        Wir prüfen Ihr Anliegen und werden uns schnellstmöglich – in der Regel innerhalb der nächsten 24
                        Stunden – bei Ihnen melden.
                    </p>
                    <div style={divider} />
                    <p style={subLabel}>Ihre Nachricht:</p>
                    <p style={messageBox}>{message}</p>
                </div>
                <div style={footer}>
                    <div style={divider} />
                    <p style={footerText}>Powered by</p>
                    <img
                        src="https://advantisgroup.de/base_logo_tb_First.png"
                        width="100"
                        alt="First"
                        style={footerLogo}
                    />
                    <p style={copyright}>
                        &copy; {new Date().getFullYear()} Advantis Group GmbH. Alle Rechte vorbehalten.
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

const subLabel = {
    color: '#1a1a1a',
    fontSize: '14px',
    fontWeight: 'bold',
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
