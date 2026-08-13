import { type WikiCategory } from "./types";

/**
 * Domain content (script cards, objection Q&As, coaching categories) — this
 * is UTA Edenred's actual German sales-call content, not app UI chrome, so
 * it stays literal rather than going through i18n (matches how Guidebooks
 * handles authored domain content elsewhere).
 */

export const WEAK_PHRASES = [
  "wuerde ich",
  "wuerden wir",
  "koennte ich",
  "koennten wir",
  "haette ich",
  "eigentlich",
  "vielleicht mal",
  "irgendwie",
];

export interface Objection {
  id: string;
  trigger: string[];
  q: string;
  a: string;
}

export const OBJECTIONS: Objection[] = [
  {
    id: "teuer",
    trigger: ["teuer", "zu teuer", "kostet", "Budget", "Preis"],
    q: '"Das ist uns zu teuer."',
    a: "Verstaendlich, dass Sie auf die Kosten schauen. Genau deshalb lohnt der Blick auf die Gesamtkosten: eigene Wallboxen laden deutlich guenstiger als oeffentlich. Was zahlen Sie denn heute ungefaehr fuers Laden unterwegs?",
  },
  {
    id: "warten",
    trigger: ["warten", "noch nicht", "zu frueh", "spaeter", "kein Thema"],
    q: '"Wir warten noch."',
    a: "Guter Punkt - viele Kunden planen genau deshalb frueh, um spaeter keinen Zeitdruck zu haben. Woran machen Sie fest, wann der richtige Zeitpunkt gekommen ist?",
  },
  {
    id: "zuhause",
    trigger: ["zuhause", "privat laden", "Steckdose"],
    q: '"Unsere Mitarbeiter laden zuhause."',
    a: "Dann sind Sie ganz vorne dabei! Wie laeuft denn aktuell die Erstattung des Ladestroms fuer die Mitarbeiter?",
  },
  {
    id: "wenige",
    trigger: ["wenige", "zu wenige", "nur ein", "erst ein", "kaum E"],
    q: '"Wir haben noch zu wenige E-Autos."',
    a: "Verstehe - genau dafuer planen wir Anlagen, die mitwachsen. Welche Fahrzeuge sollen denn als Naechstes ersetzt werden?",
  },
  {
    id: "kompliziert",
    trigger: ["kompliziert", "aufwendig", "zu viel", "komplex"],
    q: '"Das ist uns zu kompliziert."',
    a: "Das hoere ich oft. Genau deshalb uebernimmt ein Ansprechpartner alles - von der Beratung bis zur Abrechnung. Was waere fuer Sie der groesste Aufwandstreiber?",
  },
  {
    id: "zeit",
    trigger: ["keine Zeit", "keine Kapazitaet", "gerade nicht", "muss weg"],
    q: '"Dafuer habe ich jetzt keine Zeit."',
    a: "Verstehe, Ihr Tag ist voll. Zwei Minuten reichen mir fuer heute: Wann passt Ihnen ein kurzer Termin besser?",
  },
  {
    id: "netz",
    trigger: ["Netzanschluss", "Strom reicht nicht", "Kapazitaet", "Sicherung"],
    q: '"Unser Netzanschluss reicht nicht."',
    a: "Gut, dass Sie das Thema kennen. Meist loest intelligentes Lastmanagement das ohne Ausbau. Wer koennte die technischen Details mit unserem Experten klaeren?",
  },
  {
    id: "wettbewerb",
    trigger: ["anderer Anbieter", "Konkurrenz", "bereits einen", "DKV", "EnBW", "Shell"],
    q: '"Wir arbeiten schon mit einem anderen Anbieter."',
    a: "Gut zu wissen - mit wem arbeiten Sie aktuell zusammen? Was schaetzen Sie an Ihrem aktuellen Anbieter am meisten?",
  },
];

export interface ScriptCard {
  label: string;
  text: string;
  highlight?: boolean;
}

export interface ScriptSection {
  id: string;
  title: string;
  cards: ScriptCard[];
}

export const SCRIPT_SECTIONS: ScriptSection[] = [
  {
    id: "intro",
    title: "Gespraechseinstieg",
    cards: [
      {
        label: "Begruessung",
        text: "Guten Tag [Name], hier ist [Ihr Name] von [Firma]. Sie nutzen seit [Zeitraum] unsere Karten - laeuft denn alles zu Ihrer Zufriedenheit?",
      },
      {
        label: "Uebergang EV",
        text: "Schoen zu hoeren! Sie nutzen ja bereits Ladekarten - wie ist denn Ihre Ladeinfrastruktur aktuell aufgebaut? Haben Sie schon eine eigene Wallbox im Einsatz?",
      },
    ],
  },
  {
    id: "a",
    title: "Weg A - Reine EV-Flotte",
    cards: [
      {
        label: "Ladekosten",
        text: "Wie zufrieden sind Sie mit den Ladekosten und dem Aufwand dabei?",
      },
      {
        label: "Standort",
        text: "Wo stehen die Fahrzeuge nachts - am Standort oder bei den Fahrern zuhause?",
      },
      {
        label: "Gebaeude",
        text: "Wem gehoert das Gebaeude am Standort - Eigentuemer oder Mieter?",
      },
      {
        label: "Nutzen-Impuls",
        text: "Eigene Wallboxen senken die Ladekosten deutlich - und die Abrechnung laeuft automatisch auf einer Rechnung zusammen mit Ihren Karten.",
        highlight: true,
      },
    ],
  },
  {
    id: "b",
    title: "Weg B - Mischflotte EV+Verbrenner",
    cards: [
      {
        label: "Flottenstruktur",
        text: "Wie setzt sich Ihre Flotte zusammen - PKW, Transporter, LKW - und wie viele davon sind elektrisch?",
      },
      {
        label: "Zeitplan",
        text: "Welche Fahrzeuge sollen als Naechstes ersetzt werden, und in welchem Zeitraum?",
      },
      {
        label: "Erstattung",
        text: "Wie laden die vorhandenen E-Fahrzeuge heute, und wie laeuft die Erstattung fuer die Fahrer?",
      },
      {
        label: "Nutzen-Impuls",
        text: "Viele Betriebe starten bei Dienstwagen - guenstige 0,25/0,5-Prozent-Besteuerung - und bauen die Ladeinfrastruktur schrittweise auf.",
        highlight: true,
      },
    ],
  },
  {
    id: "c",
    title: "Weg C - Wallbox-Management",
    cards: [
      {
        label: "Bestand",
        text: "Wie viele Wallboxen haben Sie aktuell - Work und Home - und wer betreibt die heute?",
      },
      {
        label: "Pain Point",
        text: "Was laeuft beim Wallbox-Betrieb heute noch nicht optimal - Abrechnung, Wartung, Auslastung?",
      },
      {
        label: "Nutzen-Impuls",
        text: "Mit unserem Wallbox-Management uebernehmen wir Betrieb, Abrechnung und Support - alles auf einer Rechnung mit Ihren bestehenden Karten.",
        highlight: true,
      },
    ],
  },
  {
    id: "close",
    title: "Abschluss A / B / C",
    cards: [
      {
        label: "Ergebnis A - Termin",
        text: "Das klingt so, als waere jetzt der richtige Zeitpunkt. Unser EV-Experte meldet sich - passt Ihnen eher [Tag 1] oder [Tag 2]?",
      },
      {
        label: "Ergebnis B - Wiedervorlage",
        text: "Verstanden - das Thema wird in [Zeitraum] aktuell. Ich melde mich rechtzeitig wieder, spaetestens in drei Monaten. Einverstanden?",
      },
      {
        label: "Ergebnis C - kein Bedarf",
        text: "Danke fuer die offenen Einblicke! Eine letzte Frage: Nutzen Sie neben unseren Karten noch Services anderer Anbieter?",
      },
    ],
  },
];

export const WIKI_CATEGORIES: WikiCategory[] = [
  "Produktdaten",
  "Preisliste",
  "Technik",
  "Argumente",
  "Rechtliches",
  "Intern",
  "Links",
];

export const SCORE_CATEGORIES = [
  { key: "zufriedenheit", label: "Service-Einstieg" },
  { key: "ev_schwenk", label: "EV-Ueberleitung" },
  { key: "informationen", label: "Pflicht-Informationen" },
  { key: "offene_fragen", label: "Offene W-Fragen" },
  { key: "sprache", label: "Sprachqualitaet" },
  { key: "quittung", label: "Einwand-Quittierung" },
  { key: "abschluss", label: "Abschluss / WV" },
  { key: "skript", label: "Script-Einhaltung" },
] as const;

export const EV_CHECK_LABELS = ["Zufriedenheit", "EV-Schwenk", "Wallbox", "Planung", "Ergebnis"];

export const PATH_LABELS: Record<number, string> = {
  1: "Weg A - Reine EV-Flotte",
  2: "Weg B - Mischflotte",
  3: "Weg C - Wallbox-Mgmt",
};

export function outcomeLabel(outcome: string): string {
  return (
    { termin: "Termin", wiedervorlage: "Wiedervorlage", kein_ergebnis: "Kein Ergebnis" }[outcome] ??
    outcome
  );
}

export function scoreColorClass(value: number | null | undefined): string {
  if (!value) return "text-muted-foreground";
  if (value >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function fmtDuration(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
