"use client";

import { Header } from "@/components/Header";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandText } from "@/components/BrandText";
import Link from "next/link";

export default function Kontakt() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
  };

  const contactInfo = [
    {
      icon: Mail,
      label: "E-Mail",
      value: "touch@advantis-group.de",
      href: "mailto:touch@advantis-group.de",
    },
    {
      icon: Phone,
      label: "Telefon",
      value: "[folgt]",
      href: "tel:",
    },
    {
      icon: MapPin,
      label: "Adresse",
      value: "Bienweg 8, 90425 Nürnberg",
      href: "#",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">
            Kontakt
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Lassen Sie uns gemeinsam an Ihrem Vertriebserfolg arbeiten
          </p>
        </section>

        <section className="max-w-6xl mx-auto space-y-12">
          <div className="border border-border">
            <div className="grid md:grid-cols-3 divide-x divide-border">
              {contactInfo.map((info) => {
                const Icon = info.icon;
                return (
                  <Card key={info.label} className="border-0 rounded-none">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{info.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <a
                        href={info.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {info.value}
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="border border-border">
            <div className="grid md:grid-cols-2 divide-x divide-border">
              <Card className="border-0 rounded-none">
                <CardHeader>
                  <CardTitle className="text-2xl">Schreiben Sie uns</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-2">
                        Ihr Firmenname, Vorname, Nachname
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-2">
                        E-Mail
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-2">
                        Telefon
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium mb-2">
                        Nachricht
                      </label>
                      <textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        rows={6}
                        className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        required
                      />
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>HINWEIS AUF DATENSCHUTZ:</strong> Mit dem Absenden des Formulars erklären Sie sich damit einverstanden, dass die <BrandText brand="advantis">Advantis-group GmbH</BrandText> Ihre angegebenen Daten zum Zweck der Bearbeitung Ihrer Anfrage verwendet. Ihre Daten werden ausschließlich zur Beantwortung Ihrer Anfrage gespeichert und nicht an Dritte weitergegeben. Sie können Ihre Einwilligung jederzeit per E-Mail an touch@advantis-group.de widerrufen.{" "}
                        <Link href="/datenschutz" className="underline hover:text-foreground">
                          Weitere Informationen finden Sie in unserer Datenschutzerklärung.
                        </Link>
                      </p>
                      <Button type="submit" className="w-full">
                        Absenden
                        <Send className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-0 rounded-none">
                <CardHeader>
                  <CardTitle className="text-2xl">
                    Warum <BrandText brand="advantis">Advantis Group</BrandText>?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription className="text-base">
                    Ob Sie Unterstützung im aktiven Vertrieb, in der strategischen Beratung oder
                    bei der Auswahl moderner KI-Lösungen suchen – wir helfen Ihnen dabei!
                  </CardDescription>
                  <CardDescription className="text-base">
                    Kontaktieren Sie uns für ein unverbindliches Beratungsgespräch und lassen Sie
                    uns gemeinsam an Ihrem Vertriebserfolg arbeiten.
                  </CardDescription>
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Wir freuen uns auf Ihre Anfrage!
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
