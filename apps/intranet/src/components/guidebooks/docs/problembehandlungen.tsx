import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Problembehandlungen.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots live in /public/guidebooks/problembehandlungen/.
 */
const IMG = "/guidebooks/problembehandlungen";

const DOC: DocContent = {
  download: {
    href: `${IMG}/Problembehandlungen.docx`,
    fileName: "Problembehandlungen.docx",
  },
  sections: [
    {
      id: "kein-ton",
      title: "„Ich höre nix“ / „Der Kunde hört mich nicht“",
      blocks: [
        { kind: "text", body: "Es gibt zwei Optionen, dies zu beheben." },
        { kind: "subheading", text: "Option A — Windows-Einstellungen" },
        {
          kind: "text",
          body: "Um auf die Windows-Soundeinstellungen zuzugreifen, gibt es zwei Wege:",
        },
        {
          kind: "steps",
          items: [
            "[[Win]] + [[S]] auf der Tastatur drücken und dann **„Soundeinstellungen“** suchen.",
            "Unten rechts am Bildschirm mit der **rechten Maustaste** auf das **Lautstärke-Symbol** klicken — dann erscheint die Option, die **„Soundeinstellungen“** zu öffnen.",
          ],
        },
        {
          kind: "text",
          body: "Sobald man in den Soundeinstellungen ist, müssen diese Sachen gecheckt werden:",
        },
        {
          kind: "text",
          body: "**1. Ist das Ausgabegerät richtig?** Meist heißen die Headsets „USB“, „Logitech“, „MQ“ oder ähnlich — Namen wie „Realtek Audio“ sind meist **nicht** die richtigen Geräte. Zum Testen änderst du direkt im Ausgabe-Bereich die Lautstärke: Hörst du einen Ton, ist es das richtige Gerät.",
        },
        {
          kind: "image",
          src: `${IMG}/01.png`,
          alt: "Windows-Soundeinstellungen, Bereich Ausgabe mit markiertem Lautstärkeregler",
          width: 950,
          height: 390,
          caption: "Ausgabe-Bereich der Soundeinstellungen — über den Lautstärkeregler testen",
        },
        {
          kind: "text",
          body: "**2. Ist das Eingabegerät richtig?** Im Prinzip das Gleiche wie bei der Ausgabe — auch der Test funktioniert genauso.",
        },
        {
          kind: "image",
          src: `${IMG}/02.png`,
          alt: "Windows-Soundeinstellungen, Bereich Eingabe mit markiertem Lautstärkeregler",
          width: 963,
          height: 316,
          caption: "Eingabe-Bereich der Soundeinstellungen",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Falls die richtigen Geräte ausgewählt sind und man trotzdem nichts hört, ist es meist ein Problem an der Website selbst, die man benutzt.",
        },
        {
          kind: "text",
          body: "Dafür in den Soundeinstellungen nach unten scrollen — dort sollte man den **„Volume Mixer“** (Lautstärkemixer) sehen. Darauf klicken, dann sieht man alle Apps. Sicherstellen, dass **keiner** der **Audio-Regler** auf **Stumm** steht (siehe Bild, stummgeschaltet).",
        },
        {
          kind: "image",
          src: `${IMG}/03.png`,
          alt: "Stummgeschalteter Lautstärkeregler im Volume Mixer",
          width: 275,
          height: 74,
          caption: "So sieht ein stummgeschalteter Regler aus",
        },
        {
          kind: "text",
          body: "In den Apps kann man außerdem auswählen, welches Eingabe-/Ausgabegerät sie benutzen. Dies sollte immer auf **„Standard“/„Default“** gesetzt sein.",
        },
        {
          kind: "subheading",
          text: "Option B — Website-Einstellungen (Salesforce/Genesys)",
        },
        {
          kind: "text",
          body: "Im Telefon ist oben links ein **„Burger-Menü“** (drei Striche übereinander). Darauf klicken, dann auf **„More“/„Mehr“**, dann auf **„Settings“/„Einstellungen“** und dann **„WebRTC“**.",
        },
        {
          kind: "text",
          body: "Dort sieht man das gleiche Prinzip wie bei den Windows-Einstellungen. Hier muss man sichergehen, dass **„Pop RTC Window“** an ist und dass die **Eingabe-/Ausgabegeräte** wieder richtig eingestellt sind (normalerweise „Standard“).",
        },
      ],
    },
    {
      id: "haengt-laedt-nicht",
      title: "XYZ hängt / lädt nicht",
      blocks: [
        { kind: "text", body: "Drei Optionen:" },
        { kind: "subheading", text: "Option A — Cookies löschen" },
        {
          kind: "text",
          body: "**Chrome:** In Chrome sind die Cookies **links** von der **Adressleiste** unter **„Cookies & Websitedaten“**.",
        },
        {
          kind: "image",
          src: `${IMG}/04.png`,
          alt: "Symbol links von der Adressleiste in Chrome",
          width: 392,
          height: 52,
          caption: "Das Symbol links in der Adressleiste anklicken",
        },
        {
          kind: "image",
          src: `${IMG}/05.png`,
          alt: "Website-Menü in Chrome mit dem Eintrag „Cookies und Websitedaten“",
          width: 334,
          height: 405,
          caption: "„Cookies und Websitedaten“ im Website-Menü",
        },
        {
          kind: "text",
          body: "Dann auf **„Websitedaten auf dem Gerät verwalten“** klicken — daraufhin öffnet sich ein kleines Dialogfenster, welches (mehrere) Websites zeigt.",
        },
        {
          kind: "image",
          src: `${IMG}/06.png`,
          alt: "Dialogfenster „Websitedaten auf dem Gerät“ mit Lösch-Symbolen pro Website",
          width: 457,
          height: 347,
          caption: "Für all diese Websites auf das Lösch-Symbol (Mülleimer) drücken",
        },
        {
          kind: "text",
          body: "Ausführliche Anleitung von Google: [support.google.com/chrome/answer/95647](https://support.google.com/chrome/answer/95647)",
        },
        {
          kind: "text",
          body: "**Edge:** Hier funktioniert es über das Symbol in der Adressleiste → **„Cookies and site data“**. Ausführliche Anleitung von Microsoft: [Cookies in Microsoft Edge verwalten](https://support.microsoft.com/de-de/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use)",
        },
        {
          kind: "image",
          src: `${IMG}/07.png`,
          alt: "Adressleiste in Microsoft Edge",
          width: 204,
          height: 46,
          caption: "Das Symbol links in der Edge-Adressleiste",
        },
        {
          kind: "image",
          src: `${IMG}/08.png`,
          alt: "Website-Menü in Edge mit dem Eintrag „Cookies and site data“",
          width: 400,
          height: 302,
          caption: "„Cookies and site data“",
        },
        {
          kind: "image",
          src: `${IMG}/09.png`,
          alt: "Dialog „Cookies in use“ in Edge mit den Buttons Block und Remove",
          width: 401,
          height: 553,
          caption: "Auf die Website klicken und dann unten auf „Entfernen“/„Remove“",
        },
        {
          kind: "callout",
          tone: "warning",
          body: "Man muss sich danach **wieder anmelden** auf der Seite, wo man die Cookies löscht.",
        },
        { kind: "subheading", text: "Option B — Aktualisierung erzwingen" },
        {
          kind: "text",
          body: "Manchmal haben Browser noch veraltete Daten von einer Website auf dem PC gespeichert. Mit [[Strg]] + [[Shift]] + [[R]] (Shift = Umschalt/Pfeil hoch) kann man die Website zwingen, frische/neueste Daten wieder zu schicken.",
        },
        { kind: "subheading", text: "Option C — Warten" },
        {
          kind: "text",
          body: "Wenn etwas mal länger lädt, dann ist es manchmal so.",
        },
        {
          kind: "text",
          body: "Trotzdem können Webseiten/Server **Ausfälle** haben oder dergleichen. Diese können kurz sein oder langanhaltend. Um für einen solchen Ausfall Auskunft zu finden, kann man meist einfach **„<Website/Service> Status/Störung“** im Browser eingeben, z. B. „Salesforce Status“ oder „Outlook Störung“. Den Browser mal ganz zu schließen und wieder zu öffnen funktioniert auch.",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Meist ist dies nicht der Fall, da man durch Enterprise-Server arbeitet, welche 99 % „Uptime“ haben.",
        },
      ],
    },
    {
      id: "bildschirm",
      title: "Bildschirm flackert / ist aus / falscher Bildschirm",
      blocks: [
        {
          kind: "text",
          body: "**Option A:** HDMI-Kabel wechseln — diese Kabel sind hinten im Tresor bei der Chefin.",
        },
        {
          kind: "text",
          body: "**Option B:** [[Win]] + [[P]] drücken, dann öffnet sich ein Menü, in welchem man **„Erweitern“/„Extend“** klickt.",
        },
        {
          kind: "image",
          src: `${IMG}/10.png`,
          alt: "Windows-Projektionsmenü mit den Optionen Duplicate, Extend und Second screen only",
          width: 361,
          height: 406,
          caption: "Das Projektions-Menü (Win + P)",
        },
        {
          kind: "text",
          body: "Um die Position der Bildschirme zu ändern, wieder [[Win]] + [[P]] drücken und dann auf **„Mehr Anzeigeeinstellungen“**. Daraufhin sieht man die beiden Bildschirme digital mit „1“ und „2“ beschriftet. Auf **„Identifizieren“** klicken und sehen, welcher Bildschirm welche Nummer hat. Wenn die Reihenfolge falsch ist, einfach mit der Maus einen Bildschirm in die beliebige Reihenfolge ziehen und auf **„Anwenden“** drücken.",
        },
      ],
    },
    {
      id: "pc-langsam",
      title: "PC ist langsam",
      blocks: [
        {
          kind: "text",
          body: "Wenn ein PC länger läuft, ist es gut, den PC entweder **neu zu starten** oder komplett **auszuschalten und wieder anzuschalten** — das kann wirklich Probleme beheben.",
        },
      ],
    },
    {
      id: "kein-internet",
      title: "Kein Internet",
      blocks: [
        {
          kind: "text",
          body: "**Router checken:** Wenn eine der Anzeigen blinkt oder nicht grün ist, die Anleitung des Routers checken für die Bedeutung.",
        },
      ],
    },
    {
      id: "links",
      title: "Nützliche Links",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Audio-Einstellungen in Salesforce/Genesys ändern",
              href: "https://help.mypurecloud.com/articles/configure-webrtc-settings-in-genesys-cloud-cx-utility/",
            },
            {
              label: "Mikrofon oder Lautsprecher in Genesys ändern",
              href: "https://help.mypurecloud.com/articles/change-your-webrtc-phone-settings/",
            },
            {
              label: "Allgemeine Hilfe bei Audio-Problemen",
              href: "https://help.mypurecloud.com/articles/audio-issues-with-webrtc-phones/",
            },
            {
              label: "Kunde hört den Agenten nicht oder Agent hört den Kunden nicht",
              href: "https://help.mypurecloud.com/articles/troubleshoot-genesys-cloud-webrtc-phone/",
            },
            {
              label: "Fehler mit Mikrofon, Lautsprecher oder WebRTC-Telefon",
              href: "https://help.mypurecloud.com/articles/error-messages-with-webrtc-phones/",
            },
            {
              label: "Genesys Audio-Test starten",
              href: "https://help.mypurecloud.com/articles/run-the-built-in-genesys-cloud-webrtc-diagnostics-app/",
            },
            {
              label: "Hilfe bei Audio-Problemen über Citrix, Remote Desktop oder VDI",
              href: "https://help.mypurecloud.com/articles/require-webrtc-media-helper/",
            },
            {
              label: "WebRTC Media Helper einfach erklärt",
              href: "https://www.genesys.com/resources/genesys-cloud-webrtc-media-helper-product-overview",
            },
            {
              label: "Updates und Hinweise zu Genesys mit Salesforce",
              href: "https://help.mypurecloud.com/articles/release-notes-for-cx-cloud-from-genesys-and-salesforce/",
            },
            {
              label: "Beispiel: Problem mit einseitigem Audio",
              href: "https://community.genesys.com/discussion/one-way-audio",
            },
            {
              label: "Beispiel: Salesforce und WebRTC-Telefon",
              href: "https://community.genesys.com/discussion/salesforce-and-webrtc-plugin",
            },
            {
              label: "Beispiel: Audio-Probleme durch Netzwerk oder Firewall",
              href: "https://community.genesys.com/discussion/teammate-is-facing-audio-issues",
            },
          ],
        },
      ],
    },
    {
      id: "tastenkombinationen",
      title: "Nützliche Tastenkombinationen",
      blocks: [
        {
          kind: "shortcuts",
          items: [
            { action: "Windows-Suche öffnen", keys: ["Win", "S"] },
            { action: "Neuen Tab öffnen", keys: ["Strg", "T"] },
            { action: "Tab schließen", keys: ["Strg", "W"] },
            { action: "Seite neu laden", keys: ["Strg", "R"] },
            { action: "Favorit/Lesezeichen speichern", keys: ["Strg", "D"] },
            { action: "Adressleiste auswählen", keys: ["Strg", "L"] },
            { action: "Explorer öffnen", keys: ["Win", "E"] },
            { action: "Datei umbenennen", keys: ["F2"] },
            {
              action: "Zwischen offenen Programmen wechseln",
              keys: ["Alt", "Tab"],
            },
            { action: "Bildschirm sperren", keys: ["Win", "L"] },
            { action: "Einstellungen öffnen", keys: ["Win", "I"] },
            { action: "Browser vergrößern", keys: ["Strg", "+"] },
            { action: "Browser verkleinern", keys: ["Strg", "-"] },
            { action: "Zoom zurücksetzen", keys: ["Strg", "0"] },
          ],
        },
      ],
    },
  ],
};

export function ProblembehandlungenGuidebook() {
  return <DocViewer doc={DOC} downloadable />;
}
