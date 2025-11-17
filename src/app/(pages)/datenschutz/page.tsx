"use client";

import { Shield, Lock, User, Database, Mail, FileText, Menu, X, LucideProps } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandText } from "@/components/BrandText";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TableOfContents = ({
  sections,
  activeSection,
  onSectionClick
}: {
  sections: Array<{ id: string; icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; title: string }>;
  activeSection: string;
  onSectionClick: (id: string) => void;
}) => (
  <nav className="space-y-2">
    {sections.map((section) => {
      const Icon = section.icon;
      return (
        <button
          key={section.id}
          onClick={() => onSectionClick(section.id)}
          className={cn(
            "w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3 group",
            activeSection === section.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
        >
          <Icon className={cn(
            "w-4 h-4 shrink-0",
            activeSection === section.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )} />
          <span className="text-sm">{section.title}</span>
        </button>
      );
    })}
  </nav>
);

export default function Datenschutz() {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = useMemo(() => [
    {
      id: "overview",
      icon: Shield,
      title: "Datenschutz auf einen Blick",
      content: (
        <div className="prose prose-base max-w-none">
          <p className="text-foreground/80 leading-relaxed">
            Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren
            personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene
            Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.
          </p>
        </div>
      ),
    },
    {
      id: "general",
      icon: Lock,
      title: "Allgemeine Hinweise",
      content: (
        <div className="prose prose-base max-w-none space-y-4">
          <p className="text-foreground/80 leading-relaxed">
            Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst.
            Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der
            gesetzlichen Datenschutzbestimmungen sowie dieser Datenschutzerklärung.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Wenn Sie diese Website benutzen, werden verschiedene personenbezogene Daten erhoben.
            Diese Datenschutzerklärung erläutert, welche Daten wir erheben und wofür wir sie nutzen.
          </p>
        </div>
      ),
    },
    {
      id: "responsible",
      icon: User,
      title: "Verantwortliche Stelle",
      content: (
        <div className="prose prose-base max-w-none">
          <p className="text-foreground/80 leading-relaxed mb-4">
            Verantwortlich für die Datenverarbeitung auf dieser Website ist:
          </p>
          <div className="bg-muted/20 p-6 rounded-lg space-y-1">
            <p className="font-semibold text-foreground"><BrandText brand="advantis">Advantis-group GmbH</BrandText></p>
            <p className="text-foreground/80">Andrea Reichl</p>
            <p className="text-foreground/80">Bienweg 8</p>
            <p className="text-foreground/80">90425 Nürnberg</p>
            <p className="text-foreground/80 mt-3">E-Mail: touch@advantis-group.de</p>
          </div>
        </div>
      ),
    },
    {
      id: "collection",
      icon: Database,
      title: "Datenerfassung",
      content: (
        <div className="prose prose-base max-w-none space-y-4">
          <h3 className="text-xl font-semibold text-foreground">Welche Daten erfassen wir?</h3>
          <p className="text-foreground/80 leading-relaxed">
            Beim Besuch dieser Website speichert der Server automatisch Informationen, die Ihr
            Browser übermittelt. Dies sind:
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground/80">
            <li>IP-Adresse</li>
            <li>Browsertyp und Browserversion</li>
            <li>Verwendetes Betriebssystem</li>
            <li>Datum und Uhrzeit des Zugriffs</li>
            <li>Websites, von denen das System des Nutzers auf unsere Website gelangt</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Diese Daten werden ausschließlich zur Sicherstellung des Betriebs und zur Verbesserung
            des Angebots genutzt. Eine Zusammenführung mit anderen Datenquellen wird nicht vorgenommen.
          </p>
        </div>
      ),
    },
    {
      id: "contact",
      icon: Mail,
      title: "Kontaktformular",
      content: (
        <div className="prose prose-base max-w-none space-y-4">
          <p className="text-foreground/80 leading-relaxed">
            Wenn Sie uns per E-Mail oder Kontaktformular Anfragen zukommen lassen, werden Ihre
            Angaben aus dem Anfrageformular inklusive der von Ihnen dort angegebenen Kontaktdaten
            zwecks Bearbeitung der Anfrage und für den Fall von Anschlussfragen bei uns gespeichert.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Diese Daten geben wir nicht ohne Ihre Einwilligung weiter. Die Verarbeitung erfolgt
            auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO, sofern Ihre Anfrage mit der Erfüllung
            eines Vertrags zusammenhängt oder zur Durchführung vorvertraglicher Maßnahmen
            erforderlich ist.
          </p>
        </div>
      ),
    },
    {
      id: "rights",
      icon: FileText,
      title: "Ihre Rechte",
      content: (
        <div className="prose prose-base max-w-none space-y-4">
          <p className="text-foreground/80 leading-relaxed">
            Sie haben jederzeit das Recht auf unentgeltliche Auskunft über Ihre gespeicherten
            personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der Datenverarbeitung
            sowie ein Recht auf Berichtigung oder Löschung dieser Daten.
          </p>
          <h3 className="text-xl font-semibold text-foreground">Ihre Rechte im Überblick:</h3>
          <ul className="list-disc list-inside space-y-2 text-foreground/80">
            <li><strong>Auskunftsrecht:</strong> Sie können Auskunft über Ihre gespeicherten Daten verlangen</li>
            <li><strong>Berichtigungsrecht:</strong> Sie können die Berichtigung unrichtiger Daten verlangen</li>
            <li><strong>Löschungsrecht:</strong> Sie können die Löschung Ihrer Daten verlangen</li>
            <li><strong>Einschränkung der Verarbeitung:</strong> Sie können die Einschränkung der Verarbeitung verlangen</li>
            <li><strong>Widerspruchsrecht:</strong> Sie können der Verarbeitung widersprechen</li>
            <li><strong>Datenübertragbarkeit:</strong> Sie können Ihre Daten in einem strukturierten Format erhalten</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Hierzu sowie zu weiteren Fragen zum Thema personenbezogene Daten können Sie sich
            jederzeit unter der im Impressum angegebenen Adresse an uns wenden.
          </p>
        </div>
      ),
    },
  ], []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      setActiveSection(id);
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  return (
    <div className="min-h-screen">
      {/* Mobile TOC Button */}
      {isMobile && (
        <Button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed bottom-6 right-6 z-50 rounded-full w-14 h-14 shadow-lg"
          size="icon"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="container mx-auto px-4 pt-24 pb-24">
        <section className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              Datenschutzerklärung
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Informationen zur Verarbeitung Ihrer Daten gemäß DSGVO
            </p>
          </div>

          <div className="flex gap-8 relative">
            {/* Desktop Sidebar */}
            {!isMobile && (
              <aside className="w-72 shrink-0 sticky top-24 self-start">
                <Card className="border border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">Inhaltsverzeichnis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TableOfContents
                      sections={sections}
                      activeSection={activeSection}
                      onSectionClick={scrollToSection}
                    />
                  </CardContent>
                </Card>
              </aside>
            )}

            {/* Mobile Sidebar */}
            {isMobile && (
              <aside
                className={cn(
                  "fixed top-24 right-0 w-80 max-w-[85vw] h-[calc(100vh-6rem)] bg-background border-l border-border z-50 transition-transform duration-300 overflow-y-auto",
                  sidebarOpen ? "translate-x-0" : "translate-x-full"
                )}
              >
                <Card className="border-0 rounded-none h-full">
                  <CardHeader>
                    <CardTitle className="text-lg">Inhaltsverzeichnis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TableOfContents
                      sections={sections}
                      activeSection={activeSection}
                      onSectionClick={scrollToSection}
                    />
                  </CardContent>
                </Card>
              </aside>
            )}

            {/* Main Content */}
            <div className="flex-1 space-y-12">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <section key={section.id} id={section.id} className="scroll-mt-24">
                    <Card className="border border-border">
                      <CardHeader>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <CardTitle className="text-2xl">{section.title}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        {section.content}
                      </CardContent>
                    </Card>
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}