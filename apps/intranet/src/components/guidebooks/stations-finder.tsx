"use client";

import { ExternalLink, Fuel, MapPin, MonitorSmartphone, Network, Shield, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const STATION_URL = "https://www.uta.com/de-de/tools-services/stationsfinder";
const DRIVE_APP_IOS = "https://apps.apple.com/de/app/uta-edenred-drive/id1661660308";
const DRIVE_APP_ANDROID = "https://play.google.com/store/apps/details?id=com.edenred.uta.driver";
const SERVICE_CENTER_URL = "https://www.uta.com/de-de/service/servicecenter";

const INFO_CARDS = [
  {
    icon: <Fuel className="h-5 w-5" />,
    title: "Kraftstoff-Filter",
    text: "Diesel, AdBlue, HVO100, Benzin – nach Kraftstoffart filtern und passende Stationen finden.",
    accent: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "EV-Laden",
    text: "Über 600.000 Ladepunkte in ganz Europa. AC- und DC-Schnellladung mit UTA-Karte abrechenbar.",
    accent: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/20",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: "Maut & LKW-Services",
    text: "Mautbezahlung, Wiegestationen und LKW-freundliche Einfahrten direkt im Stationsfinder markiert.",
    accent: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
  },
  {
    icon: <MonitorSmartphone className="h-5 w-5" />,
    title: "Plus Services",
    text: "Werkstätten, Reifenservice, Waschstraßen und Raststätten in der Nähe anzeigen lassen.",
    accent: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/20",
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    title: "UTA Edenred Drive App",
    text: "Stationsfinder auch in der mobilen App verfügbar. GPS-Navigation direkt zu jeder Station.",
    accent: "text-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/20",
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: "Netz & Abdeckung",
    text: "Über 85.000 Akzeptanzstellen in Europa – eines der größten unabhängigen Kraftstoffnetze.",
    accent: "text-slate-500",
    bg: "bg-slate-50 dark:bg-slate-950/20",
  },
];

const QUICK_LINKS = [
  { label: "Stationsfinder öffnen", href: STATION_URL, icon: <MapPin className="h-4 w-4" /> },
  { label: "Drive App – iOS", href: DRIVE_APP_IOS, icon: <ExternalLink className="h-4 w-4" /> },
  { label: "Drive App – Android", href: DRIVE_APP_ANDROID, icon: <ExternalLink className="h-4 w-4" /> },
  { label: "UTA Service Center", href: SERVICE_CENTER_URL, icon: <ExternalLink className="h-4 w-4" /> },
];

export function StationsFinder() {
  return (
    <div className="space-y-6">
      {/* Hero open button */}
      <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">UTA Stationsfinder</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              85.000+ Akzeptanzstellen in Europa. Kraftstoff, EV-Laden, Maut und mehr.
            </p>
          </div>
          <a
            href={STATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" />
            Stationsfinder öffnen
          </a>
        </CardContent>
      </Card>

      {/* Info cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INFO_CARDS.map(card => (
          <Card key={card.title} className="border-border/60">
            <CardContent className="flex gap-3 p-4">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.bg} ${card.accent}`}>
                {card.icon}
              </div>
              <div>
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{card.text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schnellzugriff</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              {link.icon}
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
