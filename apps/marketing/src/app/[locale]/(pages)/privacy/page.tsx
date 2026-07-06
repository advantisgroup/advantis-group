"use client";

import { useState, useEffect, useMemo } from "react";

import {
  Shield,
  Lock,
  User,
  Database,
  Mail,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableOfContents } from "@/components/ui/TableOfContents";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export default function Datenschutz() {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations("privacy");

  const sections = useMemo(
    () => [
      {
        id: "overview",
        icon: Shield,
        title: t("sections.overview.title"),
        content: (
          <div className="prose prose-base max-w-none">
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.overview.content")}
            </p>
          </div>
        ),
      },
      {
        id: "general",
        icon: Lock,
        title: t("sections.general.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.general.content1")}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.general.content2")}
            </p>
          </div>
        ),
      },
      {
        id: "responsible",
        icon: User,
        title: t("sections.responsible.title"),
        content: (
          <div className="prose prose-base max-w-none">
            <p className="text-foreground/80 leading-relaxed mb-4">
              {t("sections.responsible.intro")}
            </p>
            <div className="bg-muted/20 p-6 rounded-lg space-y-1">
              <p className="font-semibold text-foreground">
                Advantis GmbH
              </p>
              <p className="text-foreground/80">Andrea Reichl</p>
              <p>{process.env.NEXT_PUBLIC_ADRESS}</p>
              <p className="text-foreground/80 mt-3">
                E-Mail: {process.env.NEXT_PUBLIC_EMAIL_ADRESS}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "collection",
        icon: Database,
        title: t("sections.collection.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <h3 className="text-xl font-semibold text-foreground">
              {t("sections.collection.subtitle")}
            </h3>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.collection.intro")}
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>{t("sections.collection.items.ip")}</li>
              <li>{t("sections.collection.items.browser")}</li>
              <li>{t("sections.collection.items.os")}</li>
              <li>{t("sections.collection.items.datetime")}</li>
              <li>{t("sections.collection.items.referrer")}</li>
            </ul>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.collection.footer")}
            </p>
          </div>
        ),
      },
      {
        id: "contact",
        icon: Mail,
        title: t("sections.contact.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.contact.content1")}
            </p>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.contact.content2")}
            </p>
          </div>
        ),
      },
      {
        id: "rights",
        icon: FileText,
        title: t("sections.rights.title"),
        content: (
          <div className="prose prose-base max-w-none space-y-4">
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.rights.intro")}
            </p>
            <h3 className="text-xl font-semibold text-foreground">
              {t("sections.rights.subtitle")}
            </h3>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>
                <strong>{t("sections.rights.items.access.title")}</strong>{" "}
                {t("sections.rights.items.access.description")}
              </li>
              <li>
                <strong>
                  {t("sections.rights.items.rectification.title")}
                </strong>{" "}
                {t("sections.rights.items.rectification.description")}
              </li>
              <li>
                <strong>{t("sections.rights.items.deletion.title")}</strong>{" "}
                {t("sections.rights.items.deletion.description")}
              </li>
              <li>
                <strong>{t("sections.rights.items.restriction.title")}</strong>{" "}
                {t("sections.rights.items.restriction.description")}
              </li>
              <li>
                <strong>{t("sections.rights.items.objection.title")}</strong>{" "}
                {t("sections.rights.items.objection.description")}
              </li>
              <li>
                <strong>{t("sections.rights.items.portability.title")}</strong>{" "}
                {t("sections.rights.items.portability.description")}
              </li>
            </ul>
            <p className="text-foreground/80 leading-relaxed">
              {t("sections.rights.footer")}
            </p>
          </div>
        ),
      },
    ],
    [t]
  );

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
          if (
            scrollPosition >= offsetTop &&
            scrollPosition < offsetTop + offsetHeight
          ) {
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
          {sidebarOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
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
            <h1 className="text-4xl md:text-6xl font-bold">{t("title")}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex gap-8 relative">
            {/* Desktop Sidebar */}
            {!isMobile && (
              <aside className="w-72 shrink-0 sticky top-24 self-start">
                <Card className="border border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {t("tableOfContents")}
                    </CardTitle>
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
                    <CardTitle className="text-lg">
                      {t("tableOfContents")}
                    </CardTitle>
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
              {sections.map(section => {
                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-24"
                  >
                    <Card className="border border-border">
                      <CardHeader>
                        <div className="flex items-center gap-4">
                          <CardTitle className="text-2xl">
                            {section.title}
                          </CardTitle>
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
