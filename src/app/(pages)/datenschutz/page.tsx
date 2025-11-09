import { Header } from "@/components/Header";
import { Shield, Lock, Eye, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandText } from "@/components/BrandText";

export default function Datenschutz() {
  const sections = [
    {
      icon: Shield,
      title: "Datenschutz auf einen Blick",
      content: (
        <CardDescription className="text-base">
          Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren
          personenbezogenen Daten passiert, wenn Sie diese Website besuchen.
        </CardDescription>
      ),
    },
    {
      icon: Lock,
      title: "Allgemeine Hinweise und Pflichtinformationen",
      content: (
        <CardDescription className="text-base">
          Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst.
          Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der
          gesetzlichen Datenschutzbestimmungen sowie dieser Datenschutzerklärung.
        </CardDescription>
      ),
    },
    {
      icon: Eye,
      title: "Datenerfassung auf dieser Website",
      content: (
        <CardDescription className="text-base">
          Personenbezogene Daten werden auf dieser Website nur im notwendigen Umfang erhoben.
          In keinem Fall werden die erhobenen Daten verkauft oder aus anderen Gründen an
          Dritte weitergegeben.
        </CardDescription>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">
            Datenschutzerklärung
          </h1>
        </section>

        <section className="max-w-6xl mx-auto space-y-12">
          <Card className="border border-border">
            <CardContent className="pt-6 space-y-4">
              <p className="text-lg leading-relaxed">
                Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst.
              </p>
              <CardDescription className="text-base">
                Personenbezogene Daten werden auf dieser Website nur im notwendigen Umfang erhoben. In keinem Fall werden die erhobenen Daten verkauft oder aus anderen Gründen an Dritte weitergegeben.
              </CardDescription>
            </CardContent>
          </Card>

          <div className="border border-border">
            <div className="grid md:grid-cols-3 divide-x divide-border">
              {sections.map((section) => {
                const Icon = section.icon;
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
                );
              })}
            </div>
          </div>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                Verantwortlich
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground">
              <p className="font-semibold"><BrandText brand="advantis">Advantis-group GmbH</BrandText></p>
              <p>Andrea Reichl</p>
              <p>Bienweg 8</p>
              <p>90425 Nürnberg</p>
              <p className="mt-4">E-Mail: touch@advantis-group.de</p>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                Erhebung und Verarbeitung von Daten
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-base">
                Beim Besuch dieser Website speichert der Server automatisch Informationen, die Ihr Browser übermittelt (z. B. IP-Adresse, Browsertyp, Datum und Uhrzeit des Zugriffs). Diese Daten werden ausschließlich zur Sicherstellung des Betriebs und zur Verbesserung des Angebots genutzt.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                Kontaktformular
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-base">
                Wenn Sie uns per E-Mail oder Kontaktformular Anfragen zukommen lassen, werden Ihre Angaben zur Bearbeitung der Anfrage gespeichert. Eine Weitergabe erfolgt nicht ohne Ihre Einwilligung.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-2xl">
                Recht auf Auskunft, Löschung, Sperrung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-base">
                Sie haben jederzeit das Recht auf unentgeltliche Auskunft über Ihre gespeicherten Daten sowie deren Berichtigung, Sperrung oder Löschung.
              </CardDescription>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
