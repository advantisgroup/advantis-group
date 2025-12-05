import { Building2, Mail, FileText } from 'lucide-react'

import { BrandText } from '@/components/effects/BrandText'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Impressum() {
    const sections = [
        {
            icon: Building2,
            title: 'Angaben gemäß § 5 TMG',
            content: (
                <div className="space-y-2">
                    <p className="font-semibold">
                        <BrandText brand="advantis">Advantis-group GmbH</BrandText>
                    </p>
                    <p className="text-muted-foreground">Bienweg 8</p>
                    <p className="text-muted-foreground">90425 Nürnberg</p>
                    <p className="text-muted-foreground">Deutschland</p>
                </div>
            ),
        },
        {
            icon: Mail,
            title: 'Kontakt',
            content: (
                <div className="space-y-2">
                    <p className="text-muted-foreground">
                        <span className="font-semibold">E-Mail:</span> touch@advantis-group.de
                    </p>
                    <p className="text-muted-foreground">
                        <span className="font-semibold">Telefon:</span> [folgt]
                    </p>
                </div>
            ),
        },
        {
            icon: FileText,
            title: 'Umsatzsteuer-ID',
            content: (
                <div className="space-y-2">
                    <p className="text-muted-foreground">Umsatzsteuer-ID gemäß § 27 a Umsatzsteuergesetz: [folgt]</p>
                </div>
            ),
        },
    ]

    return (
        <div className="min-h-screen">
            <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
                <section className="max-w-4xl mx-auto space-y-8 text-center">
                    <h1 className="text-5xl md:text-7xl font-bold">Impressum</h1>
                </section>

                <section className="max-w-6xl mx-auto space-y-12">
                    <div className="border border-border">
                        <div className="grid md:grid-cols-3 divide-x divide-border">
                            {sections.map((section) => {
                                const Icon = section.icon
                                return (
                                    <Card key={section.title} className="border-0 rounded-none">
                                        <CardHeader>
                                            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                                                <Icon className="w-6 h-6 text-primary" />
                                            </div>
                                            <CardTitle className="text-xl">{section.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>{section.content}</CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>

                    <Card className="border border-border">
                        <CardHeader>
                            <CardTitle className="text-2xl">Registereintrag</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-muted-foreground">
                            <p>Eintragung im Handelsregister.</p>
                            <p>Registergericht: [folgt, sobald HR-Eintrag vorliegt]</p>
                            <p>Registernummer: [folgt]</p>
                        </CardContent>
                    </Card>

                    <Card className="border border-border">
                        <CardHeader>
                            <CardTitle className="text-2xl">
                                Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-muted-foreground">
                            <p>Andrea Reichl</p>
                            <p>
                                <BrandText brand="advantis">Advantis-group GmbH</BrandText>
                            </p>
                            <p>Bienweg 8</p>
                            <p>90425 Nürnberg</p>
                        </CardContent>
                    </Card>
                </section>
            </main>
        </div>
    )
}
