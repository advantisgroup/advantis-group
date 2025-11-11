"use client";

import { Header } from "@/components/Header";
import { Mail, Phone, MapPin, Send, X, Check, Loader2, Calendar, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandText } from "@/components/BrandText";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { FormDataSchema } from "@/lib/schema";
import { z } from "zod";
import { cn } from "@/lib/utils";

type FormData = z.infer<typeof FormDataSchema>;
type ContactMode = 'message' | 'callback';

export default function Kontakt() {
  const isMobile = useIsMobile();
  const [contactMode, setContactMode] = useState<ContactMode>('message');
  const [buttonState, setButtonState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [callbackButtonState, setCallbackButtonState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState<FormData>({
    company: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
    mode: ""
  });
  const [errors, setErrors] = useState<z.ZodFlattenedError<FormData>['fieldErrors']>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setButtonState('loading');

    const result = FormDataSchema.safeParse(formData);

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      setButtonState('error');

      toast.error("Etwas ist schiefgelaufen", {
        description: "Bitte überprüfen Sie Ihre Eingaben",
        icon: <X />,
      });

      setTimeout(() => {
        setButtonState('idle');
      }, 3000);
      return;
    }

    setErrors({});
    setFormData({
      company: formData.company,
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      message: formData.message,
      phone: formData.phone,
      mode: "message"
    })

    const res = await fetch("api/db/saveContact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });
    const data = await res.json();

    if (!data.success) {
      setButtonState('error');
      if (res.status === 429) {
        toast.error("Rate Limit", {
          description: "Sie haben zu viele Anfragen geschickt. Versuchen sie es spater nochmal",
          icon: <X />,
        });
      } else {
        toast.error("Etwas ist schiefgelaufen", {
          description: "Fals das problem anhalt versuchen sie es spater nochmal",
          icon: <X />,
        });
      }
    } else {
      setButtonState('success');
      toast.success("Gesendet!", {
        description: "Wir werden uns in bis zu 24h bei ihnen melden.",
      });
    }

    setTimeout(() => {
      setButtonState('idle');
    }, 3000);
  };

  const handleCallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCallbackButtonState('loading');

    await new Promise(resolve => setTimeout(resolve, 1500));

    setCallbackButtonState('success');
    toast.success("Rückruf angefordert!", {
      description: "Wir rufen Sie zum gewünschten Zeitpunkt an.",
    });

    setTimeout(() => {
      setCallbackButtonState('idle');
    }, 3000);
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
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-16 md:space-y-24">
        <section className="max-w-4xl mx-auto space-y-6 md:space-y-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold">
            Kontakt
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Lassen Sie uns gemeinsam an Ihrem Vertriebserfolg arbeiten
          </p>
        </section>

        <section className="max-w-6xl mx-auto space-y-8 md:space-y-12">
          {isMobile ? (
            <div className="space-y-4">
              {contactInfo.map((info) => {
                const Icon = info.icon;
                return (
                  <a
                    key={info.label}
                    href={info.href}
                    className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-foreground/40 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">{info.label}</p>
                      <p className="text-base text-foreground wrap-break-word">{info.value}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="border border-border overflow-hidden rounded-lg">
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
                          className="text-muted-foreground hover:text-foreground transition-colors wrap-break-word"
                        >
                          {info.value}
                        </a>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border border-border rounded-lg overflow-hidden">
            {/* Tab Navigation */}
            <div className="border-b border-border bg-muted/30">
              <div className="flex">
                <button
                  onClick={() => setContactMode('message')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative",
                    contactMode === 'message'
                      ? "text-foreground bg-card"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Nachricht schreiben</span>
                  <span className="sm:hidden">Nachricht</span>
                  {contactMode === 'message' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
                <button
                  onClick={() => setContactMode('callback')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-4 text-sm font-medium transition-all relative border-l border-border",
                    contactMode === 'callback'
                      ? "text-foreground bg-card"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">Rückruf vereinbaren</span>
                  <span className="sm:hidden">Rückruf</span>
                  {contactMode === 'callback' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              </div>
            </div>

            <div className={`grid ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2 divide-x'} divide-border`}>
              <Card className={`border-0 rounded-none ${isMobile ? 'border-b' : ''}`}>
                <CardHeader>
                  <CardTitle className="text-xl md:text-2xl">
                    {contactMode === 'message' ? 'Schreiben Sie uns' : 'Rückruf vereinbaren'}
                  </CardTitle>
                  <CardDescription>
                    {contactMode === 'message'
                      ? 'Senden Sie uns eine Nachricht und wir melden uns innerhalb von 24 Stunden'
                      : 'Teilen Sie uns mit, wann wir Sie am besten erreichen können'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {contactMode === 'message' ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="company" className="block text-sm font-medium mb-2">
                          Ihr Firmenname
                        </label>
                        <input
                          type="text"
                          id="company"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                        />
                        {errors.company && <p className="text-red-500 text-sm mt-1">{errors.company[0]}</p>}
                      </div>
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-1/2">
                          <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                            Vorname
                          </label>
                          <input
                            type="text"
                            id="firstName"
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          />
                          {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName[0]}</p>}
                        </div>
                        <div className="w-full md:w-1/2">
                          <label htmlFor="lastName" className="block text-sm font-medium mb-2">
                            Nachname
                          </label>
                          <input
                            type="text"
                            id="lastName"
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          />
                          {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName[0]}</p>}
                        </div>
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
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                        />
                        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email[0]}</p>}
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium mb-2">
                          Telefon
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
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
                          rows={isMobile ? 4 : 6}
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-base"
                        />
                        {errors.message && <p className="text-red-500 text-sm mt-1">{errors.message[0]}</p>}
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          <strong>HINWEIS AUF DATENSCHUTZ:</strong> Mit dem Absenden des Formulars erklären Sie sich damit einverstanden, dass die <BrandText brand="advantis">Advantis-group GmbH</BrandText> Ihre angegebenen Daten zum Zweck der Bearbeitung Ihrer Anfrage verwendet. Ihre Daten werden ausschließlich zur Beantwortung Ihrer Anfrage gespeichert und nicht an Dritte weitergegeben. Sie können Ihre Einwilligung jederzeit per E-Mail an touch@advantis-group.de widerrufen.{" "}
                          <Link href="/datenschutz" className="underline hover:text-foreground">
                            Weitere Informationen finden Sie in unserer Datenschutzerklärung.
                          </Link>
                        </p>
                        <Button
                          type="submit"
                          disabled={buttonState !== 'idle'}
                          className="w-full relative overflow-hidden"
                        >
                          <span className="relative flex items-center justify-center gap-2">
                            {!(buttonState === "loading") && "Absenden"}

                            {/* Send Icon - flies away when transitioning */}
                            <span
                              className={`inline-flex transition-all duration-500 ${buttonState === 'idle'
                                ? 'translate-x-0 opacity-100'
                                : 'translate-x-12 opacity-0'
                                }`}
                            >
                              <Send className="w-4 h-4" />
                            </span>

                            {/* Loading Spinner */}
                            <span
                              className={`absolute transition-all duration-500 ${buttonState === 'loading'
                                ? 'translate-x-0 opacity-100 scale-100'
                                : buttonState === 'idle'
                                  ? '-translate-x-12 opacity-0 scale-50'
                                  : 'translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </span>

                            {/* Success Checkmark */}
                            <span
                              className={`absolute transition-all duration-500 ${buttonState === 'success'
                                ? 'translate-x-0 opacity-100 scale-100'
                                : '-translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <Check className="w-5 h-5" />
                            </span>

                            {/* Error X with shake animation */}
                            <span
                              className={`absolute transition-all duration-500 ${buttonState === 'error'
                                ? 'translate-x-0 opacity-100 scale-100 animate-shake'
                                : '-translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <X className="w-5 h-5" />
                            </span>
                          </span>
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleCallbackSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="callback-company" className="block text-sm font-medium mb-2">
                          Ihr Firmenname*
                        </label>
                        <input
                          type="text"
                          id="callback-company"
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          required
                        />
                      </div>

                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-1/2">
                          <label htmlFor="callback-firstName" className="block text-sm font-medium mb-2">
                            Vorname*
                          </label>
                          <input
                            type="text"
                            id="callback-firstName"
                            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                            required
                          />
                        </div>
                        <div className="w-full md:w-1/2">
                          <label htmlFor="callback-lastName" className="block text-sm font-medium mb-2">
                            Nachname*
                          </label>
                          <input
                            type="text"
                            id="callback-lastName"
                            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="callback-phone" className="block text-sm font-medium mb-2">
                          Telefonnummer*
                        </label>
                        <input
                          type="tel"
                          id="callback-phone"
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          placeholder="+49 123 456789"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="callback-email" className="block text-sm font-medium mb-2">
                          E-Mail*
                        </label>
                        <input
                          type="email"
                          id="callback-email"
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Für die Bestätigung Ihres Rückrufs
                        </p>
                      </div>

                      <div>
                        <label htmlFor="callback-datetime" className="block text-sm font-medium mb-2">
                          Wann können wir Sie erreichen?*
                        </label>
                        <input
                          type="datetime-local"
                          id="callback-datetime"
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Wir rufen Sie zum gewünschten Zeitpunkt an
                        </p>
                      </div>

                      <div>
                        <label htmlFor="callback-notes" className="block text-sm font-medium mb-2">
                          Anmerkungen (optional)
                        </label>
                        <textarea
                          id="callback-notes"
                          rows={3}
                          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-base"
                          placeholder="Worum geht es in dem Gespräch?"
                        />
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          <strong>HINWEIS AUF DATENSCHUTZ:</strong> Mit dem Absenden des Formulars erklären Sie sich damit einverstanden, dass die <BrandText brand="advantis">Advantis-group GmbH</BrandText> Ihre angegebenen Daten zum Zweck der Rückrufvereinbarung verwendet.{" "}
                          <Link href="/datenschutz" className="underline hover:text-foreground">
                            Weitere Informationen finden Sie in unserer Datenschutzerklärung.
                          </Link>
                        </p>
                        <Button
                          type="submit"
                          disabled={callbackButtonState !== 'idle'}
                          className="w-full relative overflow-hidden"
                        >
                          <span className="relative flex items-center justify-center gap-2">
                            {!(callbackButtonState === "loading") && "Rückruf anfordern"}

                            <span
                              className={`inline-flex transition-all duration-500 ${callbackButtonState === 'idle'
                                ? 'translate-x-0 opacity-100'
                                : 'translate-x-12 opacity-0'
                                }`}
                            >
                              <Phone className="w-4 h-4" />
                            </span>

                            <span
                              className={`absolute transition-all duration-500 ${callbackButtonState === 'loading'
                                ? 'translate-x-0 opacity-100 scale-100'
                                : callbackButtonState === 'idle'
                                  ? '-translate-x-12 opacity-0 scale-50'
                                  : 'translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </span>

                            <span
                              className={`absolute transition-all duration-500 ${callbackButtonState === 'success'
                                ? 'translate-x-0 opacity-100 scale-100'
                                : '-translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <Check className="w-5 h-5" />
                            </span>

                            <span
                              className={`absolute transition-all duration-500 ${callbackButtonState === 'error'
                                ? 'translate-x-0 opacity-100 scale-100 animate-shake'
                                : '-translate-x-12 opacity-0 scale-50'
                                }`}
                            >
                              <X className="w-5 h-5" />
                            </span>
                          </span>
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 rounded-none">
                <CardHeader>
                  <CardTitle className="text-xl md:text-2xl">
                    Warum <BrandText brand="advantis">Advantis Group</BrandText>?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription className="text-base">
                    Ob Sie Unterstützung im aktiven Vertrieb, in der strategischen Beratung oder
                    bei der Auswahl moderner KI-Lösungen suchen – wir helfen Ihnen dabei!
                  </CardDescription>
                  <CardDescription className="text-base">
                    {contactMode === 'message'
                      ? 'Kontaktieren Sie uns für ein unverbindliches Beratungsgespräch und lassen Sie uns gemeinsam an Ihrem Vertriebserfolg arbeiten.'
                      : 'Vereinbaren Sie einen Rückruf und wir besprechen gemeinsam, wie wir Ihren Vertrieb voranbringen können.'
                    }
                  </CardDescription>
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Wir freuen uns auf {contactMode === 'message' ? 'Ihre Anfrage' : 'Ihren Anruf'}!
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