"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

type StepType = "warning" | "action" | "info" | "wait" | "branch";

interface SOPStep {
  type: StepType;
  text: string;
}

interface CaseSuggestion {
  type: string;
  category: string;
  subcategory: string;
  detail: string;
}

interface MultiCase {
  label: string;
  card: CaseSuggestion;
}

interface EmailTemplate {
  title: string;
  text: string;
}

interface SOPScenario {
  id: string;
  title: string;
  icon: string;
  accentClass: string;
  steps: SOPStep[];
  caseCard?: CaseSuggestion | null;
  cases?: MultiCase[];
  email?: EmailTemplate;
}

const STEP_STYLES: Record<StepType, { container: string; dot: string; bold: boolean }> = {
  warning: {
    container:
      "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
    bold: true,
  },
  action: {
    container:
      "border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    dot: "bg-blue-500",
    bold: false,
  },
  info: {
    container: "border border-border bg-muted/50 text-foreground",
    dot: "bg-muted-foreground",
    bold: false,
  },
  wait: {
    container:
      "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
    bold: false,
  },
  branch: {
    container:
      "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bold: false,
  },
};

const CASE_CHIP: Record<string, { chip: string; accent: string }> = {
  Cards: {
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    accent: "bg-blue-500",
  },
  Toll: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    accent: "bg-emerald-500",
  },
  Finance: {
    chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    accent: "bg-fuchsia-500",
  },
  "Customer Service": {
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    accent: "bg-teal-500",
  },
};
const CASE_CHIP_FALLBACK = {
  chip: "bg-muted text-muted-foreground",
  accent: "bg-muted-foreground",
};

const SOP_SCENARIOS: SOPScenario[] = [
  {
    id: "puma_check",
    title: "IMMER: PUMA kontrollieren",
    icon: "🔍",
    accentClass: "text-rose-600 dark:text-rose-400",
    steps: [
      {
        type: "warning",
        text: "IMMER zuerst die PUMA kontrollieren – vor jeder Aktion!",
      },
      {
        type: "action",
        text: "Bei direkten Ansprechpartnern weiterleiten (auch Cases)",
      },
      { type: "info", text: "SSE Sub Master ist ausschlaggebend" },
      { type: "info", text: "Wo finden: unter 'More' → PUMA LN References" },
      {
        type: "branch",
        text: "Master / Sub Master / SSE Master / SSE Sub Master erkennbar unter PUMA LN References",
      },
    ],
    caseCard: null,
  },
  {
    id: "stammdaten",
    title: "Stammdatenänderung & Kündigung",
    icon: "📝",
    accentClass: "text-amber-700 dark:text-amber-400",
    steps: [
      {
        type: "warning",
        text: "IMMER per E-Mail – niemals telefonisch bearbeiten!",
      },
      { type: "action", text: "E-Mail an: sales@uta.com" },
      { type: "action", text: "Kundennummer MUSS immer angegeben werden" },
      {
        type: "warning",
        text: "Bankdatenänderung: WIR schicken dem Kunden ein SEPA-Mandat – NICHT umgekehrt!",
      },
      {
        type: "info",
        text: "Kunde muss neue Bankdaten per E-Mail mitteilen – nicht nur um ein neues SEPA bitten",
      },
    ],
    caseCard: null,
    email: {
      title: "Weiterleitung an Sales",
      text: "Empfänger: sales@uta.com\n\nBetreff: Stammdatenänderung / Kündigung – Kd-Nr. [KUNDENNUMMER]\n\nBitte Kundennummer immer im Betreff und im Text angeben.\nBei Bankdatenänderung: Kunde muss die neuen Bankdaten per Mail mitteilen,\ndanach sendet UTA dem Kunden ein SEPA-Mandat zur Unterzeichnung.",
    },
  },
  {
    id: "card_rejected",
    title: "Tankkarte abgelehnt / funktioniert nicht",
    icon: "💳",
    accentClass: "text-blue-700 dark:text-blue-400",
    steps: [
      { type: "action", text: "Weiterleiten an Cards → Durchwahl -660" },
      { type: "info", text: "Niemanden erreicht? → Case erstellen:" },
    ],
    caseCard: {
      type: "Cards",
      category: "Service Card Issue",
      subcategory: "Card wasn´t accepted at the station",
      detail: "",
    },
  },
  {
    id: "invoice_paid_card_blocked",
    title: "Rechnung überwiesen, Karte geht noch nicht",
    icon: "💶",
    accentClass: "text-fuchsia-700 dark:text-fuchsia-400",
    steps: [
      { type: "action", text: "Weiterleiten an Finance → Durchwahl -125" },
      { type: "info", text: "Niemanden erreicht? → Case erstellen:" },
    ],
    caseCard: {
      type: "Finance",
      category: "Credit",
      subcategory: "Payment disruptions",
      detail: "Direct debit return / Payment request",
    },
  },
  {
    id: "limit_increase",
    title: "Kunde bittet um Limit-Erhöhung",
    icon: "📈",
    accentClass: "text-orange-700 dark:text-orange-400",
    steps: [
      {
        type: "action",
        text: "In SF: Request starten (rechts auf Kundenseite, unter den Aktivitäten)",
      },
      {
        type: "wait",
        text: "Ca. 2 Min. warten, dann 1-2x Seite aktualisieren",
      },
      {
        type: "branch",
        text: "✅ GRANTED → Limit wird innerhalb von 15 Min. übertragen → Case erstellen (s. unten)",
      },
      {
        type: "branch",
        text: "❌ NICHT GRANTED + Security Amount → Bonität schlecht / keine Crefo Auskunft → Kaution anfordern (s. E-Mail-Vorlage)",
      },
      {
        type: "warning",
        text: "PREPAID-Kunden (Credit Limit = '6'): Kaution NICHT möglich → Guthabenverfahren! Erkennbar am Actual Credit Limit 'EUR 6.00'",
      },
      {
        type: "info",
        text: "Prepaid: Kunde überweist auf IBAN DE74 7958 0099 0158 7882 00 | BIC: DRESDEFF795 | Einbuchung: 3-4 Werktage | Erst dann zum Tanken nutzbar",
      },
    ],
    cases: [
      {
        label: "Bei Granted:",
        card: {
          type: "Finance",
          category: "Credit",
          subcategory: "Credit Limit",
          detail: "Credit Limit adjustments",
        },
      },
      {
        label: "Bei Security (Kaution):",
        card: {
          type: "Finance",
          category: "Credit",
          subcategory: "Securities",
          detail: "Incoming Security",
        },
      },
    ],
    email: {
      title: "E-Mail-Vorlage: Kaution anfordern",
      text: "Sehr geehrte Damen und Herren,\n\nvielen Dank für das freundliche Telefonat.\n\nWie besprochen ist für die Ausweitung Ihres Verfügungsrahmens die Stellung einer Sicherheit in gleicher Höhe notwendig.\n\nBitte hinterlegen Sie eine Kaution (Deposit) in gewünschter Höhe auf folgendes Konto:\n\nBankname: UniCredit\nIBAN DE34 7002 0270 0038 2947 41\nBIC HYVEDEMMXXX\nVerwendungszweck: Deposit, Kd-Nr.: [KUNDENNUMMER]\n\nMit freundlichen Grüßen",
    },
  },
  {
    id: "card_order",
    title: "Kunde möchte Tankkarte bestellen",
    icon: "🆕",
    accentClass: "text-sky-700 dark:text-sky-400",
    steps: [
      {
        type: "action",
        text: "Telefonisch: kostenpflichtig 9,95 €, max. 3 Karten → Kunde akzeptiert? → Cards weiterleiten (-660)",
      },
      {
        type: "action",
        text: "Kunde akzeptiert nicht → Hinweis aufs Kundenportal",
      },
      {
        type: "warning",
        text: "Vorher in SF prüfen: Welche Role ist hinterlegt? (Neues oder altes Portal?) + PUMA Reference beachten!",
      },
      {
        type: "branch",
        text: "Neues Portal (my.uta.com): Karten → Neue Karte bestellen → Einzelbestellung starten → Kartentyp wählen → PIN → Karte hinzufügen → Zur Kasse → Bestellung bestätigen",
      },
      {
        type: "branch",
        text: "Altes Portal (www.uta.com/login): Übersicht/Bestellen/Sperren → Servicekarten → Neubestellung",
      },
      {
        type: "info",
        text: "Kartentypen (gleiche Funktion, nur Kennzeichnung): Fahrerkarte = MA-bezogen | Fahrzeugkarte = KFZ-bezogen | Firmenkarte = freies Prägetextfeld",
      },
      {
        type: "info",
        text: "PIN: selbst erstellen oder automatisch generieren | Kostenstelle: kein Pflichtfeld",
      },
      {
        type: "info",
        text: "Kartenlimits (nach 'Weiter'): können meistens ignoriert werden – Standardlimitierungen greifen",
      },
    ],
    caseCard: {
      type: "Cards",
      category: "Servicecard Order",
      subcategory: "Card order",
      detail: "",
    },
  },
  {
    id: "pw_reset",
    title: "Passwort Reset (PW-Reset)",
    icon: "🔑",
    accentClass: "text-teal-700 dark:text-teal-400",
    steps: [
      { type: "warning", text: "IMMER zuerst Role im SF-Kontakt prüfen!" },
      {
        type: "branch",
        text: "Role 'MyUTA online - admin' → NEUES Portal: my.uta.com | Benutzername = E-Mail-Adresse",
      },
      {
        type: "branch",
        text: "Keine myUTA Role (z.B. Fleet Manager / Decision Maker) → ALTES Portal: www.uta.com/login | Benutzername = Kundennummer",
      },
      {
        type: "warning",
        text: "Migrierte Kunden wissen oft nicht, dass sie umgestellt wurden → IMMER auf neue Anmeldedaten hinweisen!",
      },
      {
        type: "info",
        text: "Früher im alten Portal war der Benutzername die Kundennummer – das hat sich beim neuen Portal geändert",
      },
    ],
    caseCard: {
      type: "Customer Service",
      category: "General Customer Handling",
      subcategory: "Lost mail",
      detail: "",
    },
  },
  {
    id: "invoice_copy",
    title: "Rechnungskopie (RE-Kopie)",
    icon: "🧾",
    accentClass: "text-amber-700 dark:text-amber-400",
    steps: [
      {
        type: "action",
        text: "Neues Portal (my.uta.com): Bereich 'Rechnungen' öffnen → Rechnungen direkt herunterladen (Rechnung, Detaillierte Rechnung, Zusammenfassende Rechnung)",
      },
      {
        type: "action",
        text: "Altes Portal (www.uta.com/login): Service Center → Abrechnungsunterlagen → Zeitraum & Dokumententyp wählen → Herunterladen",
      },
      {
        type: "warning",
        text: "⚠️ Archivkopien sind NICHT für Umsatzsteuerzwecke gültig!",
      },
      {
        type: "info",
        text: "Dokumententypen im alten Portal: Gesamtsummenblatt, Rechnung (für Lief. und Leist.), Einzelpostennachweis, Guthabenkonto",
      },
    ],
    caseCard: {
      type: "Customer Service",
      category: "Documents",
      subcategory: "UTA invoicing documents",
      detail: "",
    },
  },
  {
    id: "toll_error",
    title: "Mautgerät funktioniert nicht / Fehlermeldung",
    icon: "🚛",
    accentClass: "text-emerald-700 dark:text-emerald-400",
    steps: [
      {
        type: "warning",
        text: "An Maut weiterleiten – Durchwahl ist LANDABHÄNGIG! Immer erst fragen, um welches Land es geht.",
      },
      {
        type: "action",
        text: "Externe Durchwahl (für Kunden weitergeben): -617",
      },
      {
        type: "warning",
        text: "NIEMALS an Kunden weitergeben: -631 (Northeast/Central) oder -630 (Southwest)!",
      },
      {
        type: "info",
        text: "-631 Northeast/Central: Bulgarien, Dänemark, DE, Kroatien, Luxemburg, NL, Norwegen, AT, Polen, Schweden, Schweiz, Serbien, Slowakei, Slowenien, Tschechien, Ungarn, Weißrussland",
      },
      {
        type: "info",
        text: "-630 Southwest: Belgien, Frankreich, Großbritannien, Italien, Portugal, Spanien",
      },
    ],
    caseCard: {
      type: "Toll",
      category: "Contact Customer / Customer Care",
      subcategory: "Call from customer",
      detail: "",
    },
  },
  {
    id: "mautbox_info",
    title: "Welche Mautbox für welches Land?",
    icon: "📦",
    accentClass: "text-teal-700 dark:text-teal-400",
    steps: [
      {
        type: "warning",
        text: "Nur kurze allgemeine Beratung! Bei detaillierten Fragen → Maut weiterleiten (-617)",
      },
      {
        type: "info",
        text: "Fahrzeuge >3,5t | UTA One® / One® next: FR, ES, PT, BEL (Liefkenshoektunnel), IT (inkl. Fähre Caronte), PL (eToll + A4), DE, NO (Fähren/Brücken/Tunnel), DK, SE, CH (inkl. LI), HU, BG | Einmalig 20€, mtl. 4,95€ | Lieferzeit: 10-14 WT",
      },
      {
        type: "info",
        text: "Fahrzeuge >3,5t | Multibox: ES, PT, FR, BE, Liefkenshoektunnel, Herrentunnel (DE) | Einmalig 15€, mtl. 4,95€ | Lieferzeit: 10-14 WT",
      },
      {
        type: "info",
        text: "Fahrzeuge >3,5t | Satellic (Belgien): Kaution 135€, Serviceaufschlag 2,5% | Lieferzeit: 7-10 WT, am besten direkt vor Ort",
      },
      {
        type: "info",
        text: "Fahrzeuge >3,5t | E-Vignette: NL, Luxemburg, Schweden | Lieferzeit: taggleich 10-30 Min.",
      },
      {
        type: "info",
        text: "Fahrzeuge <3,5t | UTA One® Move: FR, ES, PT, IT (inkl. Mailand Area C), Fähre Caronte, Parkplätze | Einmalig 15€, mtl. 2,95€ | Lieferzeit: 5-7 WT",
      },
      {
        type: "info",
        text: "Fahrzeuge <3,5t | Liber-T (Frankreich): Einmalig 10€, mtl. 2,50€ | Lieferzeit: 10-14 WT",
      },
    ],
    caseCard: null,
  },
  {
    id: "app_login",
    title: "Kunde kann sich nicht in der App anmelden",
    icon: "📱",
    accentClass: "text-slate-600 dark:text-slate-400",
    steps: [
      {
        type: "warning",
        text: "Es gibt KEINE App für das Kundenportal! Login-Daten vom Portal funktionieren NICHT für eine App!",
      },
      {
        type: "info",
        text: "Edenred Drive App: Registrierung im ALTEN Kundenportal unter 'UTA EasyFuel Management' → Kartennummer, Vorname, Nachname, E-Mail eingeben → 'Absenden und aktivieren'",
      },
      {
        type: "warning",
        text: "Kunden mit myUTA Role im Contact haben EasyFuel derzeit NICHT! Allgemeine App-Nutzung ohne Anmeldung möglich (z.B. Stationsfinder)",
      },
      {
        type: "info",
        text: "eCharge App: Muss bereits bei Kartenbestellung angegeben worden sein – nachträgliche Aktivierung nicht möglich",
      },
      {
        type: "action",
        text: "Bei Rückfragen zur eCharge App: Digital Plus Team weiterleiten → Durchwahl -668",
      },
    ],
    caseCard: null,
  },
];

function CaseSuggestionCard({ suggestion }: { suggestion: CaseSuggestion }) {
  const style = CASE_CHIP[suggestion.type] ?? CASE_CHIP_FALLBACK;
  const fields: Array<[string, string]> = [
    ["Kategorie", suggestion.category],
    ["Unterkategorie", suggestion.subcategory],
  ];
  if (suggestion.detail) fields.push(["Detail", suggestion.detail]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 pl-5 shadow-sm">
      <span className={cn("absolute inset-y-0 left-0 w-1", style.accent)} />
      <div className="mb-3">
        <span
          className={cn(
            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            style.chip,
          )}
        >
          {suggestion.type}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="text-sm font-medium leading-snug">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailBlock({ email }: { email: EmailTemplate }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(email.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {email.title}
      </div>
      <div className="relative rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed text-foreground">
        <pre className="whitespace-pre-wrap break-words">{email.text}</pre>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "absolute right-3 top-3 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            copied
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}

export function SOPPanel() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const scenario = SOP_SCENARIOS.find((s) => s.id === activeId) ?? null;

  return (
    <div className="flex min-h-[540px] overflow-hidden rounded-xl border border-border">
      {/* Left: scenario list */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3">
        <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Szenarien
        </div>
        <div className="space-y-1">
          {SOP_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                activeId === s.id
                  ? "bg-card font-semibold shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="shrink-0 text-base">{s.icon}</span>
              <span className={cn("leading-tight", activeId === s.id && s.accentClass)}>
                {s.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!scenario ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <span className="text-4xl">👈</span>
            <p className="text-sm font-medium text-foreground">Szenario links auswählen</p>
            <p className="text-xs">Schritt-für-Schritt Anleitung + Case-Felder</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">{scenario.icon}</span>
              <h2 className={cn("text-lg font-bold", scenario.accentClass)}>{scenario.title}</h2>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Vorgehen
              </div>
              {scenario.steps.map((step, i) => {
                const st = STEP_STYLES[step.type];
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                      st.container,
                    )}
                  >
                    <span className={cn("mt-[6px] size-2 shrink-0 rounded-full", st.dot)} />
                    <span className={st.bold ? "font-semibold" : ""}>{step.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Email template */}
            {scenario.email && <EmailBlock email={scenario.email} />}

            {/* Case suggestion(s) */}
            {(scenario.caseCard || scenario.cases) && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  ⚠ Case-Felder
                </div>
                {scenario.caseCard && <CaseSuggestionCard suggestion={scenario.caseCard} />}
                {scenario.cases?.map((c, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground">{c.label}</div>
                    <CaseSuggestionCard suggestion={c.card} />
                  </div>
                ))}
              </div>
            )}

            {!scenario.caseCard && !scenario.cases && (
              <p className="text-xs italic text-muted-foreground">
                Kein Case erforderlich – nur interne Weiterleitung
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
