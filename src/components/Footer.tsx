"use client";

import { Mail, Phone, MapPin } from "lucide-react";
import Link from "next/link";
import { BrandText } from "./BrandText";

export const Footer = () => {
  const footerLinks = [
    {
      label: "Home",
      path: "/"
    },
    {
      label: "Über uns",
      path: "/uber-uns"
    },
    {
      label: "Unsere Marken",
      path: "/unsere-marken"
    },
    {
      label: "Team",
      path: "/team"
    },
    {
      label: "Kontakt",
      path: "/kontakt"
    }
  ];

  const brandLinks = [
    {
      name: "Salespirates",
      url: "https://salespirates.de"
    },
    {
      name: "Rodeo-Consulting",
      url: "https://rodeoconsulting.de"
    },
    {
      name: "Oldschool-train",
      url: "https://oldschool-train.de"
    },
    {
      name: "Sales-AI-Germany",
      url: "https://sales-ai-germany.de"
    },
  ];

  return (
    <footer className="border-t border-white bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 pb-8 border-b border-border">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-bold tracking-tight">
                <span className="text-brand-advantis">ADVANTIS</span>
                <span className="text-foreground"> GROUP</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Ihre Heimat für exzellenten Vertrieb
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <p className="text-sm text-muted-foreground">
                Ganzheitliche Sales Power
              </p>
              <p className="text-xs text-muted-foreground/80">
                Von Marketingstrategie bis KI-Tools
              </p>
            </div>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-10">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Über uns</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Die <BrandText brand="advantis">Advantis-group GmbH</BrandText> vereint über 15 Jahre Vertriebserfahrung
              unter einem Dach. Wir bringen Ihren Vertrieb auf das nächste Level.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Navigation</h3>
            <ul className="space-y-3 text-sm">
              {footerLinks.map((link, i) => (
                <li key={`${link.label}_${i}`}>
                  <Link
                    href={link.path}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Unsere Marken</h3>
            <ul className="space-y-3 text-sm">
              {brandLinks.map((brand, i) => (
                <li key={`${brand.name}_${i}`}>
                  <Link href={brand.url} className="text-muted-foreground hover:text-foreground transition-colors">
                    {brand.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Kontakt</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="tel:" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="w-4 h-4" />
                  <span>[folgt]</span>
                </Link>
              </li>
              <li>
                <Link href="mailto:touch@advantis-group.de" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="w-4 h-4" />
                  <span>touch@advantis-group.de</span>
                </Link>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>Bienweg 8, 90425 Nürnberg</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear().toString()} <BrandText brand="advantis">Advantis Group</BrandText> GmbH. Alle Rechte vorbehalten.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/impressum"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Impressum
              </Link>
              <Link
                href="/datenschutz"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Datenschutz
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
