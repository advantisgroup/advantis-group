interface EmailTemplateProps {
    firstName: string
    lastName: string
    message: string
}

export function EmailTemplate({ firstName, lastName, message }: EmailTemplateProps) {
    return (
        <div>
            <h1>
                Welcome, {firstName} {lastName}!
            </h1>
            <p>{message}</p>
        </div>
    )
}
