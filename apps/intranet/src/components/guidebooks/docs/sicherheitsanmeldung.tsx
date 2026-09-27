import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Passkey/Windows Hello + Authenticator-App-Einrichtung für die
 * Sicherheitsanmeldung (Step-up). Kein Word-Import wie die übrigen
 * Guidebooks — trotzdem bewusst German-only, wie der Rest der Guidebooks.
 * Verlinkt aus der Grace-Period-Banner-CTA (GracePeriodBanner) und aus den
 * Passkey-/Authenticator-Karten unter /settings/account.
 */
const DOC: DocContent = {
  sections: [
    {
      id: "uebersicht",
      title: "Übersicht",
      blocks: [
        {
          kind: "text",
          body: "Manche Konten müssen bei der Anmeldung eine zusätzliche Sicherheitsstufe erfüllen — je nachdem, welche das Unternehmen vorschreibt, entweder einen **Passkey** oder eine **Authenticator-App**. Ein E-Mail-Code reicht dafür allein nicht aus, er wird nur für schwächere Nachfragen (z. B. bei einem neuen Gerät) akzeptiert.",
        },
        {
          kind: "text",
          body: "Die meisten Kolleg:innen arbeiten an einem **Windows-PC** und haben ein **iPhone** — dieser Guide zeigt beide Wege: einen Passkey über **Windows Hello** direkt am PC anlegen, und wie man ihn zusätzlich über das iPhone verfügbar macht, damit man auf mehreren Geräten angemeldet bleibt.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Ihr müsst euch nicht für beides entscheiden — ein Passkey **und** eine Authenticator-App können parallel eingerichtet sein. Wenn eines der beiden Geräte mal nicht griffbereit ist, bleibt das andere als Rückweg.",
        },
      ],
    },
    {
      id: "windows-hello",
      title: "Passkey über Windows Hello einrichten (PC)",
      blocks: [
        {
          kind: "text",
          body: "Windows Hello ist die Anmeldung per **PIN, Fingerabdruck oder Gesichtserkennung** — sie muss einmalig in Windows eingerichtet sein, bevor der Browser sie für einen Passkey verwenden kann.",
        },
        { kind: "subheading", text: "Schritt 1 — Windows Hello aktivieren" },
        {
          kind: "steps",
          items: [
            "[[Win]] + [[I]] drücken, um die Windows-Einstellungen zu öffnen.",
            "**„Konten“** → **„Anmeldeoptionen“** wählen.",
            "Unter **„Anmeldeoptionen“** eine der Windows-Hello-Methoden wählen (PIN ist die einfachste, Fingerabdruck/Gesichtserkennung brauchen passende Hardware).",
            "Auf **„Einrichten“** klicken und den Anweisungen folgen.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Fehlt die Option komplett (z. B. „von der Organisation verwaltet“ ausgegraut), ein IT-Ticket erstellen — dann muss die IT die Einstellung für das Gerät freigeben.",
        },
        { kind: "subheading", text: "Schritt 2 — Passkey im Intranet anlegen" },
        {
          kind: "steps",
          items: [
            "Im Intranet zu **„Einstellungen“ → „Mein Konto“** gehen, zum Bereich **„Passkeys“** scrollen.",
            "Auf **„Passkey hinzufügen“** klicken, einen Namen vergeben (z. B. „Arbeits-PC“).",
            "Der Browser fragt automatisch nach Windows Hello — mit PIN, Fingerabdruck oder Gesicht bestätigen.",
          ],
        },
      ],
    },
    {
      id: "iphone-multi-device",
      title: "Passkey zusätzlich mit dem iPhone verfügbar machen",
      blocks: [
        {
          kind: "text",
          body: "Ein am PC per Windows Hello erstellter Passkey bleibt normalerweise **nur auf diesem PC** — Windows synchronisiert ihn nicht automatisch auf ein iPhone. Es gibt zwei Wege, trotzdem von beiden Geräten aus angemeldet zu sein.",
        },
        { kind: "subheading", text: "Weg A — Direkt am iPhone einen eigenen Passkey anlegen" },
        {
          kind: "text",
          body: "Im Intranet auf dem iPhone (Safari) einloggen, zu **„Einstellungen“ → „Mein Konto“** → **„Passkeys“** gehen und dort ebenfalls **„Passkey hinzufügen“** wählen. Face ID/Touch ID bestätigt die Erstellung. Damit hat man zwei unabhängige Passkeys — einen für den PC, einen fürs iPhone.",
        },
        {
          kind: "subheading",
          text: "Weg B — Passkey vom PC über QR-Code mit dem iPhone verbinden",
        },
        {
          kind: "text",
          body: "Beim Anlegen eines Passkeys am PC (Chrome oder Edge) bietet der Browser statt Windows Hello auch **„Anderes Gerät verwenden“ / „Use a phone or tablet“** an. Danach erscheint ein QR-Code.",
        },
        {
          kind: "steps",
          items: [
            "Im Browser-Dialog **„Anderes Gerät verwenden“** wählen.",
            "Mit der iPhone-Kamera den angezeigten QR-Code scannen.",
            "Auf dem iPhone die Anfrage mit Face ID/Touch ID bestätigen.",
          ],
        },
        {
          kind: "callout",
          tone: "info",
          body: "Damit der so erstellte Passkey danach auch **ohne PC**, also direkt in Safari auf dem iPhone, funktioniert, muss auf dem iPhone der **iCloud-Schlüsselbund** aktiv sein (Einstellungen → [Name] → iCloud → Passwörter & Schlüsselbund) — sonst bleibt der Passkey nur auf dem Gerät, auf dem er ursprünglich erstellt wurde.",
        },
      ],
    },
    {
      id: "authenticator-app",
      title: "Alternative: Authenticator-App (TOTP)",
      blocks: [
        {
          kind: "text",
          body: "Wo ein Passkey (noch) nicht möglich ist, reicht auch eine **Authenticator-App** auf dem Smartphone (z. B. Microsoft Authenticator, Google Authenticator oder 1Password) — sie erzeugt alle 30 Sekunden einen neuen 6-stelligen Code.",
        },
        {
          kind: "steps",
          items: [
            "Authenticator-App auf dem iPhone installieren.",
            "Im Intranet unter **„Einstellungen“ → „Mein Konto“** → **„Authentifizierungs-App“** auf **„Authentifizierungs-App einrichten“** klicken.",
            "Den angezeigten QR-Code mit der App scannen.",
            "Den 6-stelligen Code aus der App eingeben, um die Einrichtung zu bestätigen.",
            "Die angezeigten **Wiederherstellungscodes** sicher aufbewahren (z. B. Passwort-Manager) — falls das Handy mal verloren geht, kommt man damit trotzdem wieder rein.",
          ],
        },
      ],
    },
    {
      id: "problembehandlung",
      title: "Problembehandlung",
      blocks: [
        {
          kind: "text",
          body: "**„Windows Hello ist nicht verfügbar / ausgegraut“** — Meist eine von der IT verwaltete Geräterichtlinie. IT-Ticket erstellen, statt es selbst umgehen zu wollen.",
        },
        {
          kind: "text",
          body: "**„Der Passkey vom PC erscheint nicht auf dem iPhone“** — iCloud-Schlüsselbund war beim Anlegen wahrscheinlich nicht aktiv, oder es ist nicht dieselbe Apple-ID auf beiden Geräten. Einfachster Fix: direkt am iPhone in Safari einen zweiten, eigenen Passkey anlegen (siehe „Weg A“ oben), statt auf die Synchronisierung zu warten.",
        },
        {
          kind: "text",
          body: "**„Mein Browser bietet keinen Passkey/QR-Code an“** — Ein veralteter Browser. Chrome, Edge und Safari aktuell halten (Browser-Update prüfen), dann erneut versuchen.",
        },
        {
          kind: "text",
          body: "**„Ich habe mein Handy verloren“** — Mit einem der **Wiederherstellungscodes** der Authenticator-App-Einrichtung anmelden. Ohne Codes und ohne zweites Gerät mit Passkey: IT/Admin kontaktieren, damit die Anmeldemethoden am Konto zurückgesetzt werden.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Der Hinweis-Banner oben auf der Seite verschwindet erst, wenn die tatsächlich geforderte Methode (Passkey oder Authenticator-App, je nachdem was verlangt ist) eingerichtet ist — ein einfacher Neustart der Seite reicht danach.",
        },
      ],
    },
    {
      id: "links",
      title: "Offizielle Anleitungen",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Windows Hello einrichten (Microsoft Support)",
              href: "https://support.microsoft.com/en-us/windows/learn-about-windows-hello-and-set-it-up-dae28983-8242-bb2a-d3d1-87c9d265a5f0",
            },
            {
              label: "Passkeys auf dem iPhone verwenden (Apple Support)",
              href: "https://support.apple.com/guide/iphone/use-passkeys-to-sign-in-to-websites-and-apps-iphf538ea8d0/ios",
            },
            {
              label: "Passkeys über iCloud-Schlüsselbund synchronisieren (Apple Support)",
              href: "https://support.apple.com/en-us/102195",
            },
            {
              label: "Passkeys per QR-Code vom Handy in Chrome/Edge nutzen (Google-Hilfe)",
              href: "https://support.google.com/chrome/answer/13168025",
            },
            {
              label: "Microsoft Authenticator herunterladen",
              href: "https://support.microsoft.com/en-us/authenticator/download-microsoft-authenticator",
            },
          ],
        },
      ],
    },
  ],
};

export function SicherheitsanmeldungGuidebook() {
  return <DocViewer doc={DOC} />;
}
