import { type DocContent, DocViewer } from "../doc-viewer";

/**
 * Converted from the Word document "Onedrive_Schulung.docx".
 * Content is intentionally German-only, like the other guidebooks.
 * Screenshots live in /public/guidebooks/onedrive-schulung/.
 */
const IMG = "/guidebooks/onedrive-schulung";

const DOC: DocContent = {
  sections: [
    {
      id: "onedrive-oeffnen",
      title: "OneDrive öffnen",
      blocks: [
        {
          kind: "text",
          body: "Um auf den OneDrive-Ordner zuzugreifen, gibt es zwei Möglichkeiten.",
        },
        { kind: "subheading", text: "Option A — Lesezeichen" },
        {
          kind: "text",
          body: "Über die Lesezeichenleiste: Das Lesezeichen ist meist **„OneDrive Team“** oder **„OneDrive AG“** benannt. Es bringt euch direkt zu dem **„Team“**-Ordner unter „Advantis GmbH“.",
        },
        {
          kind: "image",
          src: `${IMG}/01.png`,
          alt: "OneDrive-Lesezeichen in der Lesezeichenleiste des Browsers",
          width: 234,
          height: 47,
          caption: "Das OneDrive-Lesezeichen in der Lesezeichenleiste",
        },
        { kind: "subheading", text: "Option B — Tab selbst öffnen" },
        {
          kind: "text",
          body: "Alle Browser haben eine Tastenkombination, um einen neuen Tab zu öffnen — für Chrome/Edge: [[Strg]] + [[T]]. Damit öffnet sich ein neuer Tab, und in der Leiste, wo man den Link eingibt, schreibt ihr: **onedrive.live.com**. Daraufhin navigiert man zu der Leiste **„Geteilt“**, wo man dann den Ordner **„Team“** sehen kann — geteilt von Advantis GmbH oder Advantis Group. Die anderen Ordner kann man ignorieren.",
        },
        {
          kind: "image",
          src: `${IMG}/02.png`,
          alt: "OneDrive-Navigation mit dem Bereich Geteilt",
          width: 229,
          height: 210,
          caption: "Der Bereich „Geteilt“ in der OneDrive-Navigation",
        },
        {
          kind: "image",
          src: `${IMG}/03.png`,
          alt: "Geteilter Ordner Team von Advantis Group in OneDrive",
          width: 1102,
          height: 236,
          caption: "Der geteilte Ordner „Team“",
        },
        {
          kind: "callout",
          tone: "info",
          body: "Falls, aus welchem Grund auch immer, keine der Optionen funktioniert, helfen diese direkten Links. Danach sollte man den „Team“-Ordner sehen (oder man ist schon drinnen):",
        },
        {
          kind: "links",
          items: [
            {
              label: "OneDrive Team-Ordner (Schulungen)",
              href: "https://onedrive.live.com/?id=%2Fpersonal%2FD14F15B8672B5E84%2FDocuments%2FAdvantis%20GmbH%2FTeam%2FSchulungen&viewid=47146f59-ff9e-4797-ab2c-c9c830a95b14&view=0",
            },
            {
              label: "Advantis GmbH — OneDrive-Ordner",
              href: "https://onedrive.live.com/?id=/personal/D14F15B8672B5E84/Documents/Advantis%20GmbH",
            },
          ],
        },
      ],
    },
    {
      id: "lesezeichen",
      title: "Lesezeichen",
      blocks: [
        {
          kind: "text",
          body: "Um Lesezeichen hinzuzufügen, kann man die Tastenkombination [[Strg]] + [[D]] benutzen oder das **Sternchen rechts** an der **Adressleiste** klicken.",
        },
        {
          kind: "text",
          body: "Es sollte sich ein kleines Popup öffnen, welches dich fragt: **Wie soll das Lesezeichen heißen** und **wo soll das Lesezeichen gespeichert werden**?",
        },
        {
          kind: "image",
          src: `${IMG}/04.png`,
          alt: "Chrome-Popup „Lesezeichen hinzugefügt“ mit Feldern für Name und Ordner",
          width: 473,
          height: 268,
          caption: "Das Popup „Lesezeichen hinzugefügt“",
        },
        {
          kind: "text",
          body: "Gib dem Lesezeichen einen richtigen Namen, z. B. „Outlook Edenred“, „Salesforce“, „Ionos AG“ (Advantis Group), etc. Das Lesezeichen muss dann in der **„Lesezeichenleiste“** (auch „Lesezeichenspalte“) gespeichert werden. Dies muss man nur einmal machen — in der Zukunft wird dann jedes Lesezeichen dort gespeichert.",
        },
        { kind: "subheading", text: "„Ich finde mein Lesezeichen nicht“" },
        {
          kind: "text",
          body: "Es gibt nur begrenzt Platz in der Lesezeichenleiste, und Lesezeichen, die nach dem Limit gespeichert werden, werden nicht angezeigt. Dafür muss man ganz rechts an die Lesezeichenleiste und entweder auf den **Ordner** oder das **„Fenster“-Symbol** drücken.",
        },
        {
          kind: "image",
          src: `${IMG}/05.png`,
          alt: "Schaltfläche „Alle Lesezeichen“ ganz rechts in der Lesezeichenleiste",
          width: 262,
          height: 126,
          caption: "„Alle Lesezeichen“ ganz rechts in der Leiste",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Um dies zu vermeiden, sollte man keine Lesezeichen für jeden einzelnen Kunden erstellen. Wenn es mal sein muss, das Lesezeichen wieder löschen, wenn es nicht mehr gebraucht wird — oder z. B. ein Lesezeichen für „Salesforce“ anlegen und den Kundennamen auf einem Papier schreiben.",
        },
      ],
    },
    {
      id: "dateien-hochladen",
      title: "Wie lade ich Dateien hoch?",
      blocks: [
        {
          kind: "text",
          body: "Navigiere zu dem Ordner, in welchem du die Datei haben willst. Dann klickst du auf **„Erstellen oder hochladen“** und dann **„Dateien hochladen“**.",
        },
        {
          kind: "image",
          src: `${IMG}/06.png`,
          alt: "Button „Erstellen oder hochladen“ in OneDrive",
          width: 269,
          height: 90,
          caption: "Der Button „Erstellen oder hochladen“",
        },
        {
          kind: "image",
          src: `${IMG}/07.png`,
          alt: "Menüeintrag „Dateien hochladen“ in OneDrive",
          width: 300,
          height: 154,
          caption: "„Dateien hochladen“ im Menü",
        },
        {
          kind: "text",
          body: "Daraufhin kannst du einfach auf eine Datei klicken und **„Auswählen“** drücken. Die Datei wird dann im Ordner gespeichert.",
        },
        {
          kind: "callout",
          tone: "tip",
          body: "Man kann auch **Drag-and-Drop** benutzen: Einfach mit der linken Maustaste eine Datei in den Ordner hineinziehen.",
        },
      ],
    },
  ],
};

export function OneDriveSchulungGuidebook() {
  return <DocViewer doc={DOC} />;
}
