import type {
  Chapter,
  DataKey,
  ResearchTask,
  Scenario,
  SegmentKey,
} from "./types";

export const SEG: Record<SegmentKey, string> = {
  markt: "Markt & Grundlagen",
  produkt: "Produkt & Technik",
  prozess: "Prozess & Kosten",
  recht: "Recht, Steuern & Abrechnung",
  vertrieb: "Vertrieb & Argumentation",
  praxis: "Recherche & Praxis",
  calls: "Call-Training (Warm Leads)",
};

/** Labels for the data points a call-simulator scenario tracks. */
export const DLAB: Record<DataKey, string> = {
  total: "Fahrzeuge gesamt & Mix PKW/Van/LKW",
  mix: "Antriebsmix EV/Benzin/Diesel",
  us: "Nutzung bei uns (Karten/Services)",
  comp: "Fremdanbieter (Name)",
  ready: "Transformationsplan & Zeitschiene",
  wb: "Wallboxen Work/Home (Anzahl, Anbieter, Management)",
  own: "Gebäude: Eigentümer oder Mieter",
  need: "Beratungsbedarf Steuern/Recht",
  next: "Nächster Schritt vereinbart",
};

export const CHAPTERS: Chapter[] = [
  {
    id: "c1",
    title: "Der EV-Markt: Warum jetzt?",
    segment: "markt",
    body: [
      {
        type: "paragraph",
        text: "Elektromobilität wächst nicht aus Idealismus, sondern aus handfesten Gründen. Für dein Verkaufsgespräch zählen vor allem diese Treiber: CO2- und ESG-Ziele, Total Cost of Ownership (TCO), steigende Kraftstoffpreise, steuerliche Vorteile, Mitarbeiterbindung und der schrittweise Verbrenner-Ausstieg der Hersteller.",
      },
      {
        type: "paragraph",
        text: "Merksatz für den Kundentermin: 'Deutschland verfügt heute über weit mehr als 150.000 öffentliche Ladepunkte, die Zahl wächst jedes Jahr zweistellig.' Mehr Detailwissen brauchst du nicht. Glaubwürdigkeit entsteht durch Einordnung, nicht durch Statistik.",
      },
      { type: "heading", text: "Die vier Gruppen von Marktteilnehmern" },
      {
        type: "list",
        items: [
          "Fahrzeughersteller (OEM): VW, Mercedes, BMW, Tesla, Renault, Volvo",
          "Ladeinfrastruktur-Betreiber (CPO): EnBW, Ionity, Aral Pulse, E.ON Drive, Allego, Fastned, Tesla Supercharger",
          "Wallbox-Hersteller: ABB, ABL, Mennekes, KEBA, Alfen, Easee, Heidelberg, Schneider, Siemens, Zaptec",
          "Installationspartner: lokale Elektriker und deutschlandweite Errichter",
        ],
      },
    ],
    quiz: [
      {
        question:
          "Ein Geschäftsführer fragt nach dem wirtschaftlichen Hauptargument für E-Fahrzeuge im Fuhrpark. Was nennst du?",
        options: [
          "Die höhere Endgeschwindigkeit der Fahrzeuge",
          "Die Total Cost of Ownership: geringere Energie-, Wartungs- und Steuerkosten über die Laufzeit",
          "Das moderne Image der Marke Tesla",
        ],
        correctIndex: 1,
      },
      {
        question: "Zu welcher Gruppe von Marktteilnehmern gehört KEBA?",
        options: [
          "Ladeinfrastruktur-Betreiber",
          "Wallbox-Hersteller",
          "Fahrzeughersteller",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "c2",
    title: "Grundlagen: Antriebe, AC/DC, Ladeleistung",
    segment: "markt",
    body: [
      {
        type: "paragraph",
        text: "Antriebsarten in einem Satz: BEV fährt rein elektrisch. PHEV kombiniert E-Motor mit Verbrenner und lädt an der Steckdose. Ein normaler Hybrid lädt nur beim Fahren. Die Brennstoffzelle erzeugt Strom aus Wasserstoff.",
      },
      {
        type: "paragraph",
        text: "AC vs. DC, die wichtigste Erklärung im Kundengespräch: Aus dem Netz kommt Wechselstrom (AC), die Batterie speichert Gleichstrom (DC). Beim AC-Laden wandelt das Auto selbst um. Der eingebaute Lader begrenzt auf meist 11 oder 22 kW, deshalb lädt man zuhause und am Arbeitsplatz AC. DC-Schnelllader wandeln in der Säule um und liefern direkt in die Batterie, darum stehen sie an der Autobahn.",
      },
      { type: "heading", text: "Ladeleistungen einordnen" },
      {
        type: "list",
        items: [
          "3,7 bis 7,4 kW: einphasig, Übernachtladen",
          "11 kW: der Standard für Wallboxen, meldepflichtig, aber ohne Genehmigung",
          "22 kW: doppelt so schnell, genehmigungspflichtig, nicht von jedem Auto AC-seitig nutzbar",
          "50 bis 150 kW: DC-Schnellladen unterwegs",
          "ab ca. 150-300 kW: High Power Charging (HPC)",
        ],
      },
      {
        type: "paragraph",
        text: "Faustformel Ladezeit: Batteriegröße (kWh) geteilt durch Ladeleistung (kW). Ein VW ID.7 mit 77 kWh braucht an 11 kW rund 7 Stunden, perfekt für die Nacht oder den Arbeitstag. Ein Transporter am 150-kW-Lader ist in gut 30 Minuten wieder bei 80 Prozent.",
      },
    ],
    quiz: [
      {
        question: "Warum lädt ein E-Auto zuhause 'nur' mit 11 kW?",
        options: [
          "Weil der Netzbetreiber mehr grundsätzlich verbietet",
          "Weil beim AC-Laden der im Auto verbaute Lader die Leistung begrenzt",
          "Weil Wallboxen technisch nicht mehr schaffen",
        ],
        correctIndex: 1,
      },
      {
        question:
          "Kunde: 'Wie lange lädt ein 77-kWh-Fahrzeug an 11 kW?' Deine Antwort?",
        options: [
          "Etwa 2 Stunden",
          "Etwa 7 Stunden, ideal über Nacht oder während der Arbeitszeit",
          "Etwa 24 Stunden",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "c3",
    title: "Lademöglichkeiten & Wallboxen",
    segment: "produkt",
    body: [
      {
        type: "paragraph",
        text: "Die Ladewelt eines Kunden besteht aus Bausteinen: Home Charging (zuhause), Work Charging (Firmenparkplatz), Depot Charging (Fuhrpark über Nacht), Destination Charging (Hotel, Restaurant), Public Charging (öffentlich) und High Power Charging (Autobahn). Gute Beratung kombiniert diese Bausteine. Die meisten Flotten laden zu rund 80 Prozent am Depot oder zuhause.",
      },
      { type: "heading", text: "Warum keine Schuko-Steckdose?" },
      {
        type: "paragraph",
        text: "Haushaltssteckdosen sind nicht für stundenlange Dauerlast gebaut: Überhitzungs- und Brandgefahr. Eine Wallbox lädt schneller, kommuniziert mit dem Fahrzeug, hat eigene Schutztechnik (FI, Leitungsschutz) und ermöglicht Abrechnung und Steuerung.",
      },
      { type: "heading", text: "Bestandteile einer Ladelösung" },
      {
        type: "list",
        items: [
          "Wallbox, FI-Schutzschalter, Leitungsschutz, Zuleitung, Sicherung",
          "Zähler (ggf. MID), Backend, RFID oder App",
        ],
      },
      {
        type: "paragraph",
        text: "Private Wallbox: einfach und günstig. Business-Wallbox: Abrechnung, Benutzerverwaltung, Backend. Flottenanlage: Lastmanagement, Skalierbarkeit, Serviceverträge. Wer nur 'eine Box' verkauft, verschenkt das Projekt.",
      },
    ],
    quiz: [
      {
        question:
          "Kunde: 'Wir laden einfach an der normalen Steckdose.' Dein stärkstes Gegenargument?",
        options: [
          "Schuko ist nicht für Dauerlast ausgelegt: Brandrisiko, langsam, ohne Abrechnung oder Steuerung",
          "Das sieht unprofessionell aus",
          "Steckdosenladen ist gesetzlich verboten",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c4",
    title: "Der Projektablauf in 12 Schritten",
    segment: "prozess",
    body: [
      {
        type: "paragraph",
        text: "Der Verkäufer ist der Reiseführer durch das Projekt. Wer den Ablauf souverän erklärt, nimmt dem Kunden die größte Sorge: 'Wird das kompliziert?'",
      },
      {
        type: "list",
        items: [
          "1. Bedarfsermittlung - 2. Beratung - 3. Fotos - 4. Digitale Begehung - 5. Vor-Ort-Begehung - 6. Angebot",
          "7. Netzbetreiber (Meldung/Genehmigung) - 8. Installation - 9. Inbetriebnahme - 10. Abnahme - 11. Einweisung - 12. Support",
        ],
      },
      {
        type: "paragraph",
        text: "Wichtig zu betonen: Fotos und digitale Begehung sparen dem Kunden Zeit, die Netzbetreiber-Abstimmung übernehmt ihr, und nach der Inbetriebnahme gibt es Einweisung und laufenden Support.",
      },
    ],
    quiz: [
      {
        question: "Das Angebot ist angenommen. Was kommt als Nächstes?",
        options: [
          "Sofort die Installation",
          "Die Anmeldung bzw. Genehmigung beim Netzbetreiber",
          "Die Abnahme",
        ],
        correctIndex: 1,
      },
      {
        question: "Womit beginnt jedes gute Projekt?",
        options: [
          "Mit der Bedarfsermittlung: Fahrzeuge, Fahrprofile, Standort, Nutzer",
          "Mit der Produktauswahl aus dem Katalog",
          "Mit dem Tiefbau",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c5",
    title: "Lastmanagement - der wichtigste Begriff",
    segment: "produkt",
    body: [
      {
        type: "paragraph",
        text: "Jeder Netzanschluss hat eine begrenzte Leistung. Ohne Lastmanagement wären schon wenige Ladepunkte zu viel. Mit Lastmanagement verteilt die Anlage die verfügbare Leistung intelligent auf alle Fahrzeuge.",
      },
      {
        type: "list",
        items: [
          "Statisch: der Ladeinfrastruktur wird ein festes Leistungsbudget zugeteilt",
          "Dynamisch: die Anlage misst den Gebäudeverbrauch live und nutzt jede freie Reserve",
          "Peak Shaving: Lastspitzen kappen und teure Leistungspreise vermeiden",
          "Priorisierung: wichtige Fahrzeuge (z. B. Servicefahrzeuge) laden zuerst",
          "Phasenmanagement: gleichmäßige Verteilung auf die drei Netzphasen",
        ],
      },
      {
        type: "paragraph",
        text: "Das Verkaufsargument: Lastmanagement macht 10, 20 oder 50 Ladepunkte am bestehenden Anschluss möglich und erspart dem Kunden oft einen teuren Netzausbau.",
      },
    ],
    quiz: [
      {
        question:
          "Kunde: 'Unser Netzanschluss reicht doch nie für 20 Ladepunkte!' Deine Antwort?",
        options: [
          "Dann müssen Sie den Anschluss auf jeden Fall ausbauen",
          "Dynamisches Lastmanagement verteilt die vorhandene Leistung intelligent, meist ganz ohne Netzausbau",
          "Dann laden eben nur 3 Autos gleichzeitig",
        ],
        correctIndex: 1,
      },
      {
        question: "Was bedeutet Peak Shaving?",
        options: [
          "Lastspitzen kappen, um hohe Leistungsentgelte zu vermeiden",
          "Besonders schnelles Laden zur Mittagszeit",
          "Das Abschalten der Anlage am Wochenende",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c6",
    title: "Kostenstruktur & Praxisbeispiele",
    segment: "prozess",
    body: [
      {
        type: "paragraph",
        text: "Der Preis besteht nie nur aus der Wallbox. Kostentreiber sind: Installation, Leitungslänge und Kabelweg, ggf. Fundament und Tiefbau, Lastmanagement, Backend und SIM, Wartung, Service und wiederkehrende Prüfung.",
      },
      {
        type: "list",
        items: [
          "Einfamilienhaus: ca. 1.500 bis 2.500 Euro",
          "Tiefgarage: ca. 3.000 bis 10.000 Euro",
          "20 Ladepunkte: ca. 30.000 bis 100.000 Euro",
        ],
      },
      {
        type: "paragraph",
        text: "Regel für das Gespräch: nie einen Preis ins Blaue nennen, aber immer eine ehrliche Spanne mit Begründung. Das schafft Vertrauen und qualifiziert den Kunden.",
      },
    ],
    quiz: [
      {
        question:
          "Was ist typischerweise der größte versteckte Kostentreiber in Bestandsobjekten?",
        options: [
          "Die Farbe der Wallbox",
          "Der Kabelweg: lange Zuleitungen, Durchbrüche, Tiefbau",
          "Die RFID-Karten",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "c7",
    title: "Abrechnung, Recht & Steuern kompakt",
    segment: "recht",
    body: [
      {
        type: "list",
        items: [
          "Abrechnung: RFID oder App identifiziert den Nutzer, das Backend rechnet ab - für Mitarbeiter, Dienstwagen, Besucher und Flotte getrennt",
          "Eichrecht und MID-Zähler: wer kWh verkauft oder erstattet, braucht konforme Messung",
          "Meldepflicht: Wallboxen bis 11 kW werden dem Netzbetreiber gemeldet, über 11 kW sind genehmigungspflichtig",
          "Weitere Rechtsthemen: VDE-Normen, Brandschutz, WEG- und Mietrecht, DGUV-Prüfung im Betrieb",
          "Dienstwagensteuer: 0,25 Prozent (BEV bis Preisgrenze) bzw. 0,5 Prozent statt 1 Prozent - ein starkes Argument",
          "Laden beim Arbeitgeber ist für Mitarbeiter steuerfrei; Home Charging kann pauschal erstattet werden",
          "THG-Quote: jährliche Zusatzerlöse pro E-Fahrzeug - Grundverständnis genügt; Förderprogramme regional prüfen",
        ],
      },
    ],
    quiz: [
      {
        question:
          "Ab welcher Leistung ist eine Wallbox beim Netzbetreiber genehmigungspflichtig?",
        options: [
          "Ab 3,7 kW",
          "Über 11 kW - bis 11 kW genügt die Meldung",
          "Erst ab 50 kW",
        ],
        correctIndex: 1,
      },
      {
        question:
          "Ein Mitarbeiter lädt sein privates E-Auto beim Arbeitgeber. Steuerlich gilt:",
        options: [
          "Der Ladestrom vom Arbeitgeber ist für den Mitarbeiter steuerfrei",
          "Er muss den Strom als geldwerten Vorteil voll versteuern",
          "Das ist arbeitsrechtlich verboten",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c8",
    title: "Das Backend & OCPP",
    segment: "produkt",
    body: [
      {
        type: "paragraph",
        text: "Ab dem zweiten Ladepunkt wird Software wichtiger als Hardware. Das Backend liefert: Fernwartung und Softwareupdates (weniger Vor-Ort-Einsätze), Benutzerverwaltung, automatische Abrechnung, Ladestatistiken und Kostentransparenz.",
      },
      {
        type: "paragraph",
        text: "Der Schlüsselbegriff ist OCPP, das offene Kommunikationsprotokoll zwischen Wallbox und Backend. OCPP-fähige Hardware bedeutet: keine Herstellerbindung, das System bleibt erweiterbar und zukunftssicher. Genau das will ein Geschäftsführer hören, der Investitionssicherheit sucht.",
      },
    ],
    quiz: [
      {
        question: "Warum ist OCPP ein Verkaufsargument?",
        options: [
          "Offener Standard: keine Herstellerbindung, Backend und Hardware bleiben frei kombinierbar",
          "OCPP macht das Laden doppelt so schnell",
          "OCPP ist ein staatliches Förderprogramm",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c9",
    title: "Nutzenargumentation nach Zielgruppe",
    segment: "vertrieb",
    body: [
      {
        type: "list",
        items: [
          "Geschäftsführer: Investitionssicherheit durch offene Standards (OCPP), Wirtschaftlichkeit über TCO, Zukunftsfähigkeit - Strategie statt Technik",
          "Fuhrparkleiter: Verfügbarkeit der Fahrzeuge jeden Morgen, einfache Verwaltung über ein Backend, Skalierbarkeit vom Pilot zur Flotte",
          "HR: Laden als Mitarbeiter-Benefit, Bindung und Recruiting, steuerfreies Laden beim Arbeitgeber",
          "Finanzabteilung: TCO-Vergleich, 0,25/0,5-Prozent-Dienstwagenregel, THG-Erlöse, transparente Kosten pro kWh und Nutzer",
          "Facility Management: Betriebssicherheit, geregelte Wartung und DGUV-Prüfung, Integration in Gebäudetechnik und Lastmanagement",
          "Nachhaltigkeitsbeauftragte: messbare CO2-Reduktion, ESG-Ziele, Reporting direkt aus dem Backend",
        ],
      },
    ],
    quiz: [
      {
        question:
          "Dein Gegenüber ist Fuhrparkleiter. Welches Argument ziehst du zuerst?",
        options: [
          "Das skandinavische Design der Wallbox",
          "Verfügbarkeit: jedes Fahrzeug ist morgens geladen, verwaltet über ein einziges Backend",
          "Die CO2-Bilanz des Herstellwerks",
        ],
        correctIndex: 1,
      },
      {
        question: "Für die Finanzabteilung ist das stärkste Argument:",
        options: [
          "TCO, Steuervorteile (0,25/0,5 Prozent) und transparente Kosten pro kWh",
          "Die Farbe der Ladesäulen",
          "Die Ladegeschwindigkeit an der Autobahn",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: "c10",
    title: "Einwandbehandlung",
    segment: "vertrieb",
    body: [
      {
        type: "paragraph",
        text: "Überlege dir erst selbst eine Antwort, dann öffne die Musterantwort. Nutze dabei die Quittungsmethode: den Einwand wertschätzend annehmen, den Kunden bestätigen und mit einer offenen Frage weiterführen.",
      },
      {
        type: "objections",
        items: [
          [
            "Das ist zu teuer.",
            "Verstehe ich. Lassen Sie uns statt des Anschaffungspreises die Gesamtkosten ansehen: geringere Energie- und Wartungskosten, Steuervorteile und THG-Erlöse. Über die Laufzeit rechnet sich die Anlage. Und wir starten gern klein und skalieren.",
          ],
          [
            "Wir warten noch.",
            "Warten kostet: Die Fahrzeuge kommen ohnehin, und wer heute plant, sichert sich Netzkapazität und vermeidet später Zeitdruck. Ein EV Ready Check kostet Sie nichts außer einem Termin.",
          ],
          [
            "Unsere Mitarbeiter laden zu Hause.",
            "Gut, Home Charging ist ein Baustein. Aber nicht jeder hat eine Wallbox zuhause, und die Erstattung braucht eichrechtskonforme Messung. Work Charging ergänzt das perfekt und ist für Mitarbeiter sogar steuerfrei.",
          ],
          [
            "Wir haben noch zu wenige E-Autos.",
            "Genau der richtige Zeitpunkt: Wir planen die Anlage so, dass sie mitwächst - heute 2 Ladepunkte, vorbereitet für 20. Nachrüsten ist immer teurer als vorausschauend planen.",
          ],
          [
            "Die Technik entwickelt sich zu schnell.",
            "Deshalb setzen wir auf offene Standards wie OCPP und Typ 2, die seit Jahren stabil sind. Ihre Hardware bleibt kompatibel, Updates kommen über das Backend.",
          ],
          [
            "Unser Netzanschluss reicht nicht.",
            "Das klärt unsere Begehung. Meistens löst dynamisches Lastmanagement das Problem ohne Netzausbau, weil es die vorhandene Leistung intelligent verteilt.",
          ],
          [
            "Das ist zu kompliziert.",
            "Genau dafür sind wir da: Wir übernehmen Begehung, Netzbetreiber, Installation und Einweisung. Sie haben einen Ansprechpartner für alles.",
          ],
          [
            "Wir wollen keinen Verwaltungsaufwand.",
            "Das Backend automatisiert Abrechnung, Nutzerverwaltung und Reporting. Der laufende Aufwand ist geringer als eine Tankkartenverwaltung.",
          ],
          [
            "Wir haben keinen Elektriker.",
            "Brauchen Sie nicht. Wir arbeiten mit qualifizierten Installationspartnern und liefern schlüsselfertig inklusive Abnahme und Wartung.",
          ],
        ],
      },
    ],
    quiz: [
      {
        question:
          "'Die Technik entwickelt sich zu schnell.' Deine beste Antwort setzt auf:",
        options: [
          "Rabatt anbieten, um die Unsicherheit auszugleichen",
          "Offene Standards (OCPP, Typ 2) und Updates über das Backend als Investitionsschutz",
          "Zustimmen und den Termin vertagen",
        ],
        correctIndex: 1,
      },
      {
        question: "'Wir haben keinen Elektriker.' Was antwortest du?",
        options: [
          "Dann geht das Projekt leider nicht",
          "Kein Problem: qualifizierte Installationspartner liefern schlüsselfertig inkl. Abnahme und Wartung",
          "Sie können die Wallbox selbst anschließen",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "c11",
    title: "Rechercheaufgaben: UTA, DKV, Zaptec, Spirii",
    segment: "praxis",
    research: true,
  },
  {
    id: "c13",
    title: "Call-Training: Warm Leads - Prozess & Leitfaden",
    segment: "calls",
    body: [
      { type: "diagram" },
      {
        type: "paragraph",
        text: "Warm Leads sind Bestandskunden, die unsere Tank- oder EV-Karten bereits nutzen. Ziel jedes Calls: ein qualifizierter Lead mit dem Wunsch nach einem Angebot oder einer weiterführenden Beratung durch einen Experten - oder ein sauber dokumentierter Account mit Follow-up-Termin. Nicht zu technisch werden: einfache Argumente, klarer Prozess.",
      },
      { type: "heading", text: "Unser Prozess in 4 Schritten" },
      {
        type: "list",
        items: [
          "1. Leadliste: Telesales arbeitet die zugeteilten Bestandskunden ab",
          "2. Kontakt-Check: Wurde der Kunde in den letzten 3 Monaten kontaktiert? Account und offene Opportunities in Salesforce prüfen - wenn ja, nicht anrufen",
          "3. Anruf nach Gesprächsleitfaden (Service-Call-Einstieg)",
          "4a. Opportunity vorhanden: in Salesforce anlegen - EV-Buddy als 'Opportunity Owner', Sales Manager als 'Acquired by'",
          "4b. Keine Opportunity: nichts anlegen, aber alle relevanten Daten im Account erfassen, um das Potenzial später bewerten zu können",
        ],
      },
      { type: "heading", text: "Der Einstieg (Service-Call)" },
      {
        type: "paragraph",
        text: "'Guten Tag Frau/Herr ..., Sie nutzen seit ... unsere Karten - läuft alles zu Ihrer Zufriedenheit? Schön! Wie sieht es bei Ihnen mit Elektromobilität aus - planen Sie, Teile Ihrer Flotte auf EV umzustellen?' Danach die Schlüsselfrage: 'Haben Sie bereits E-Fahrzeuge?' (vorher immer die vorhandenen Daten in Salesforce prüfen).",
      },
      { type: "heading", text: "Die drei Abzweigungen" },
      {
        type: "list",
        items: [
          "Keine Fahrzeuge: über die Elektrifizierungsplanung des Unternehmens sprechen und einen passenden Follow-up-Termin vereinbaren",
          "Fahrzeuge geliefert oder bestellt, aber noch keine Ladelösung: der 'Perfect Spot' - direkt in die Bedarfsanalyse einsteigen",
          "Fahrzeuge vorhanden: 'Nutzen Sie bereits Work, Home oder Road?' - je nach Antwort ins Migrations- oder Acquisition-Playbook",
        ],
      },
      {
        type: "heading",
        text: "Migrations-Playbook (Kunde hat schon Work- oder Home-Wallboxen)",
      },
      {
        type: "list",
        items: [
          "Wallboxen ohne Management (nicht 'supervised'): erklären, warum Management für B2B-Flotten wichtig ist - TCO, Wartung, automatische Abrechnung",
          "Wallboxen mit Fremdanbieter-Management: Wettbewerber erfragen und mit Battlecard argumentieren - Ziel ist die Ablösung des Wallbox-Managements (Hardware bleibt, Software und Abrechnung wechseln zu uns)",
        ],
      },
      { type: "heading", text: "Acquisition-Playbook (nur Road oder gar nichts)" },
      {
        type: "paragraph",
        text: "Work & Home als Ergänzung verkaufen. Übungsannahme für dieses Training: Unsere Ladelösung besteht aus der Spirii-Software (Backend, App, Abrechnung) und Beratung/Installation über The Mobility House München - beide behandeln wir so, als wären sie Teil unserer Firma. Argumente einfach halten: günstiger laden als öffentlich, alles auf einer Rechnung, ein Ansprechpartner.",
      },
      { type: "heading", text: "Sales-Skills im Call" },
      {
        type: "list",
        items: [
          "Offene Fragen: W-Fragen (Wie, Was, Wann, Wer) statt Ja/Nein - 'Wie laden Ihre Fahrer heute?' statt 'Laden Ihre Fahrer zuhause?'",
          "Quittungsmethode: Einwände aufnehmen statt kontern - in drei Schritten: 1) den Einwand wertschätzend annehmen, 2) den Kunden bestätigen, 3) mit einer offenen Frage weiterführen. Beispiel - Kunde: 'Wir sind schon mit Wallboxen versorgt.' Du: 'Dann sind Sie ja ganz vorne dabei - gut, dass Sie das gleich sagen! Das heißt, Sie kennen sich schon aus: Welchen Anbieter nutzen Sie denn aktuell?' So wird aus dem Einwand ein Gesprächseinstieg",
          "Quittung auch zum Sichern von Infos: wichtige Aussagen zusammenfassen und bestätigen lassen - 'Verstehe: 14 Fahrzeuge, davon 3 elektrisch, geladen wird bisher nur unterwegs. Habe ich das richtig?' Der Kunde fühlt sich verstanden und du sicherst die Datenqualität",
          "Einwandbehandlung: klassisch über die Quittungsmethode (annehmen, bestätigen, offene Frage), Nutzen einfach erklären - nie in Technik flüchten",
        ],
      },
      { type: "heading", text: "Typische Kombinationen und Vorgehen" },
      {
        type: "list",
        items: [
          "Only Road (EV-Karte, keine Wallbox): Acquisition - Work & Home anbieten, Einstieg über Ladekosten und Komfort",
          "Road + Home: Work am Standort ergänzen, automatische Heimstrom-Erstattung ansprechen",
          "Road + Work: Home für Dienstwagenfahrer ergänzen, Gebäudefrage (Eigentum/Miete) klären",
          "Fuel + EV + Road (Mischflotte): Transformationsplan erfragen, Work als ersten Schritt positionieren, Follow-ups entlang des Fahrzeug-Zulaufs",
          "Wallboxen vorhanden, ohne Management: Management nachrüsten - Argumente Abrechnung, Wartung, TCO",
          "Wallboxen vorhanden, Fremdanbieter-Management: Migration - Wettbewerber erfragen, Wechselargumente (eine Rechnung, eine Karte, ein Ansprechpartner), Ziel Ablösung",
          "Nur Fuel, keine EV: kein Druck - Pläne besprechen, Daten erfassen, Follow-up setzen (Schritt 4b)",
        ],
      },
      { type: "heading", text: "Checkliste Datenerfassung (in jedem Call)" },
      {
        type: "list",
        items: [
          "Fahrzeuge gesamt (wenn der Kunde es nennen möchte) und Mischung PKW / Van / LKW",
          "Antriebsmix: EV / Benzin / Diesel - und wie viele EV bestellt sind",
          "Was nutzt der Kunde bereits bei uns, was bei anderen Anbietern (Name notieren!)",
          "Wie gut ist er auf die Transformation vorbereitet? Gibt es Pläne mit Zeitschiene?",
          "Wallboxen Work/Home im Einsatz? Anzahl, Anbieter, gemanagt oder nicht?",
          "Gebäude: Eigentümer oder Mieter? Wenn Eigentümer vorhanden: Name der Eigentümergesellschaft",
          "Beratungsbedarf: Steuervorteile bei EV, rechtliche Fragen zur Wallbox-Installation in B2B-Gebäuden",
          "Ergebnis festhalten: Opportunity (4a) oder Account-Update mit Follow-up (4b)",
        ],
      },
    ],
    quiz: [
      {
        question: "Was prüfst du, bevor du einen Warm Lead anrufst?",
        options: [
          "Nur die Telefonnummer",
          "Ob der Kunde in den letzten 3 Monaten kontaktiert wurde und welche Daten/Opportunities in Salesforce stehen",
          "Die Website des Kunden auswendig lernen",
        ],
        correctIndex: 1,
      },
      {
        question:
          "Der Kunde hat Wallboxen, die von einem Wettbewerber gemanagt werden. Welches Playbook?",
        options: [
          "Acquisition: einfach neue Wallboxen verkaufen",
          "Migration: Wettbewerber erfragen, mit Battlecard argumentieren - Ziel ist die Ablösung des Wallbox-Managements",
          "Auflegen, der Kunde ist versorgt",
        ],
        correctIndex: 1,
      },
      {
        question:
          "Kunde: 'Wir sind schon mit Wallboxen versorgt.' Wie reagierst du nach der Quittungsmethode?",
        options: [
          "'Dann sind Sie ja ganz vorne dabei - gut, dass Sie das gleich sagen! Das heißt, Sie kennen sich schon aus: Welchen Anbieter nutzen Sie denn aktuell?'",
          "'Schade, dann brauchen Sie uns ja nicht mehr.'",
          "'Unsere Wallboxen sind aber deutlich besser als Ihre.'",
        ],
        correctIndex: 0,
      },
      {
        question:
          "Der Kunde hat weder E-Fahrzeuge noch konkrete Pläne. Was tust du?",
        options: [
          "Trotzdem eine Opportunity anlegen",
          "Elektrifizierungspläne besprechen, Follow-up-Termin setzen und alle Daten im Account erfassen - keine Opportunity (Schritt 4b)",
          "Den Kunden von der Liste streichen",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "c14",
    title: "Call-Simulator: Warm Leads",
    segment: "calls",
    sim: true,
  },
  {
    id: "c12",
    title: "Glossar",
    segment: "markt",
    glossary: [
      ["AC", "Wechselstrom aus dem Netz - das Auto wandelt selbst um"],
      ["DC", "Gleichstrom - Schnellladen direkt in die Batterie"],
      ["BEV", "Rein batterieelektrisches Fahrzeug"],
      ["PHEV", "Plug-in-Hybrid: E-Motor plus Verbrenner, extern ladbar"],
      ["kW", "Ladeleistung - wie schnell geladen wird"],
      ["kWh", "Energiemenge - wie viel die Batterie speichert"],
      ["Typ 2", "Europäischer Standardstecker für AC-Laden"],
      ["CCS", "Combined Charging System - Standard für DC-Schnellladen"],
      ["CHAdeMO", "Älterer DC-Ladestandard, v. a. asiatische Modelle"],
      ["OCPP", "Offenes Protokoll zwischen Wallbox und Backend"],
      ["OCPI", "Protokoll zwischen Betreibern und Fahrstromanbietern (Roaming)"],
      ["Backend", "Software für Verwaltung, Abrechnung und Fernwartung"],
      ["RFID", "Karte/Chip zur Nutzeridentifikation an der Wallbox"],
      ["Lastmanagement", "Intelligente Verteilung der verfügbaren Leistung"],
      ["Peak Shaving", "Kappen von Lastspitzen zur Kostensenkung"],
      ["MID-Zähler", "Zertifizierter Zähler für die Energiemessung"],
      ["Eichrecht", "Rechtsrahmen für kWh-genaue Abrechnung"],
      ["HPC", "High Power Charging - Schnellladen ab ca. 150 kW"],
      ["CPO", "Charge Point Operator - Betreiber der Ladepunkte"],
      ["EMP", "E-Mobility Provider - bietet Ladetarife und Zugang"],
      ["Roaming", "Laden bei fremden Betreibern mit einem Vertrag"],
      ["SoC", "State of Charge - aktueller Ladestand der Batterie"],
      ["V2G", "Vehicle-to-Grid: das Auto speist ins Netz zurück"],
      ["V2H", "Vehicle-to-Home: das Auto versorgt das Gebäude"],
      ["Plug & Charge", "Auto authentifiziert sich selbst (ISO 15118)"],
      ["ISO 15118", "Norm für die Kommunikation Fahrzeug/Ladepunkt"],
      ["THG-Quote", "Jährliche Erlöse für den Halter eines E-Fahrzeugs"],
      ["DGUV", "Vorgeschriebene Prüfung elektrischer Anlagen im Betrieb"],
      ["Ladepunkt", "Ein Anschluss, an dem ein Fahrzeug laden kann"],
      ["Ladehub", "Standort mit vielen (Schnell-)Ladepunkten"],
    ],
  },
];

export const RESEARCH_TASKS: ResearchTask[] = [
  {
    id: "r_uta_dkv",
    title:
      "Aufgabe 1: Vergleiche UTA eCharge und DKV Mobility (@road, @work, @home)",
    intro:
      "UTA Edenred und DKV Mobility sind zwei große Mobilitätsdienstleister, die Flotten komplette Ladelösungen für unterwegs, am Arbeitsplatz und zuhause anbieten. Recherchiere auf den verlinkten Seiten und beantworte die Fragen. Alle Antworten sind online auffindbar.",
    links: [
      ["UTA: Elektromobilität (Übersicht)", "https://web.uta.com/elektromobilitaet"],
      ["UTA: Laden unterwegs", "https://web.uta.com/laden/unterwegs"],
      ["UTA: Laden zu Hause", "https://web.uta.com/laden/zu-hause"],
      [
        "DKV: Ladelösungen im Überblick",
        "https://www.dkv-mobility.com/de/de/e-mobility/charging-e-vehicles/charging-solutions-at-a-glance",
      ],
      [
        "DKV: Zuhause laden (@home)",
        "https://www.dkv-mobility.com/de/de/e-mobility/charging-e-vehicles/charging-at-home",
      ],
      [
        "DKV: Am Arbeitsplatz laden (@work)",
        "https://www.dkv-mobility.com/de/elektromobilitaet/e-fahrzeuge-laden/am-arbeitsplatz-laden/",
      ],
    ],
    questions: [
      "Wie nennen DKV Mobility und UTA Edenred jeweils ihre Lösungen für die drei Ladesituationen unterwegs, am Arbeitsplatz und zuhause? (Tipp: DKV nutzt @-Begriffe)",
      "Wie viele öffentliche Ladepunkte in Europa geben die beiden Anbieter aktuell jeweils an? Notiere die Zahl und wo du sie gefunden hast.",
      "Wie lösen beide Anbieter die Erstattung des Heimladestroms für Dienstwagenfahrer, und welche Rolle spielt dabei die Eichrechtskonformität bzw. der geeichte Zähler?",
      "Nenne aus Sicht eines Fuhrparkleiters je eine Gemeinsamkeit und einen Unterschied der beiden Angebote (z. B. Karte/App, Multi-Energie, Netzgröße, Zusatzservices).",
    ],
  },
  {
    id: "r_zaptec",
    title: "Aufgabe 2: Beispielhafter Wallbox-Hersteller Zaptec",
    intro:
      "Zaptec ist ein börsennotierter Wallbox-Hersteller. Recherchiere auf der deutschen Website.",
    links: [
      [
        "Zaptec: Wallbox für Zuhause",
        "https://www.zaptec.com/de/ladeloesungen/privates-laden/wallbox-fuer-zuhause",
      ],
      [
        "Zaptec Pro (gewerbliches Laden)",
        "https://www.zaptec.com/de/ladeloesungen/gewerbliches-laden/zaptec-pro",
      ],
    ],
    questions: [
      "Aus welchem Land stammt Zaptec, und welche Produktlinien richten sich an Privatkunden bzw. an Gewerbe/Mehrfamilienhäuser?",
      "Warum eignet sich die Zaptec Pro besonders für Tiefgaragen, Mehrfamilienhäuser und Flotten? Nenne mindestens drei Merkmale (z. B. Lastmanagement/Phasenausgleich, OCPP, MID/Eichrechtskonformität, Skalierbarkeit).",
    ],
  },
  {
    id: "r_spirii",
    title: "Aufgabe 3: Beispielhafter Ladelösungs-Anbieter Spirii",
    intro:
      "Spirii ist ein Anbieter für Ladeinfrastruktur und Ladesoftware. Recherchiere auf der Website und in der verlinkten Pressemeldung.",
    links: [
      ["Spirii: Website", "https://spirii.com"],
      [
        "UTA-News: UTA eCharge wird zur 360-Grad-Ladelösung (mit Spirii)",
        "https://web.uta.com/news/uta-echarge-wird-zur-360-ladeloesung",
      ],
    ],
    questions: [
      "Welche Leistungen bietet Spirii entlang der Ladekette an (Hardware, Installation, Software/App, Abrechnung)?",
      "Zu welcher Unternehmensgruppe gehört Spirii mehrheitlich, und mit welchem Tankkarten-/Mobilitätsanbieter baut Spirii eine gemeinsame 360-Grad-Ladelösung (Home, Work, Depot) auf?",
    ],
  },
  {
    id: "r_tmh",
    title: "Aufgabe 4: Beispielhafter Partner The Mobility House München",
    intro:
      "The Mobility House ist ein Technologieunternehmen für Ladelösungen und Energiemanagement - in unserem Training die Übungsannahme für Beratung und Installation. Recherchiere auf der Website.",
    links: [
      ["The Mobility House: Startseite", "https://www.mobilityhouse.com/de_de/"],
      [
        "The Mobility House Solutions: Ladelösungen für Unternehmen",
        "https://www.mobilityhouse.com/de_de/b2b",
      ],
      [
        "ChargePilot: Lade- und Energiemanagement",
        "https://www.mobilityhouse.com/de_de/chargepilot",
      ],
    ],
    questions: [
      "Wo hat The Mobility House seinen Hauptsitz, und wie heißt der Geschäftsbereich für gewerbliche Ladelösungen? Welche Leistungen deckt er ab (z. B. Planung, Installation, Abrechnung)?",
      "Wie heißt das Lade- und Energiemanagementsystem von The Mobility House, und was ist sein wichtigster Vorteil für Flotten? (Stichworte: herstellerunabhängig, Lastspitzen kappen, Netzanschluss optimal nutzen)",
      "Finde auf der Website eine Referenz bzw. einen Praxisfall (z. B. Logistik, Post, Autohandel) und fasse in einem Satz zusammen, was dort umgesetzt wurde.",
    ],
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "s1",
    combo: "Only Road",
    title: "Handwerksbetrieb: EV-Karten, keine Wallboxen",
    persona:
      "Frau Menzel, Fuhrparkleiterin eines Sanitärbetriebs. Nutzt eure Karten seit 4 Jahren. Salesforce: 14 Fahrzeuge vermerkt, keine Wallbox-Daten.",
    targets: ["total", "mix", "us", "own", "ready", "next"],
    outcome:
      "Opportunity anlegen (4a): EV-Buddy als 'Opportunity Owner', Sales Manager als 'Acquired by'. Expertenberatung Work Charging ist terminiert.",
    steps: [
      {
        customerSay: "Ja, mit den Karten sind wir zufrieden. Worum geht's denn?",
        options: [
          {
            text: "Das freut mich! Wie sieht es bei Ihnen aktuell mit Elektromobilität aus - planen Sie, Teile der Flotte umzustellen?",
            points: 2,
            skill: "Offene Frage",
            feedback:
              "Service-Call-Einstieg nach Leitfaden, offene W-Frage statt Ja/Nein.",
          },
          {
            text: "Haben Sie E-Autos?",
            points: 1,
            feedback:
              "Geschlossene Frage - liefert nur Ja/Nein. Besser offen einsteigen: 'Wie sieht es mit Elektromobilität aus?'",
          },
          {
            text: "Wir haben gerade ein Wallbox-Angebot - soll ich Ihnen eins schicken?",
            points: 0,
            feedback:
              "Viel zu früh. Ohne Bedarfsanalyse kein Angebot - erst fragen, dann anbieten.",
          },
        ],
      },
      {
        customerSay:
          "Wir haben drei E-Transporter, der Rest von unseren 14 fährt Diesel. Geladen wird unterwegs mit Ihren Karten.",
        options: [
          {
            text: "Verstehe: 14 Fahrzeuge, davon drei elektrisch, der Rest Diesel - und geladen wird bisher nur unterwegs über Road. Habe ich das richtig?",
            points: 2,
            skill: "Quittung",
            dataKeys: ["total", "mix", "us"],
            feedback:
              "Saubere Quittung: fasst zusammen, sichert die Daten, der Kunde fühlt sich verstanden.",
          },
          {
            text: "Okay. Und laden die Fahrer auch zuhause?",
            points: 1,
            feedback:
              "Die Info verpufft ohne Quittung - erst zusammenfassen und bestätigen lassen, dann weiterfragen.",
          },
          {
            text: "Nur drei? Da lohnt sich ja noch nichts.",
            points: 0,
            feedback:
              "Abwertend und falsch - genau hier beginnt die Transformation.",
          },
        ],
      },
      {
        customerSay: "Genau. Öffentlich laden ist aber ehrlich gesagt ziemlich teuer.",
        options: [
          {
            text: "Das höre ich oft - und genau da setzen wir an: Mit eigenen Wallboxen laden Sie deutlich günstiger, alles auf einer Rechnung. Wie laden Ihre Fahrer denn heute nach Feierabend?",
            points: 2,
            skill: "Quittung + offene Frage",
            feedback:
              "Einwand aufgenommen, einfacher Nutzen, offene Anschlussfrage - keine Technik.",
          },
          {
            text: "Ja, die Preise an Schnellladern sind hoch.",
            points: 1,
            feedback:
              "Nur zustimmen bringt das Gespräch nicht weiter - Nutzen und Anschlussfrage fehlen.",
          },
          {
            text: "Dafür geht es an der Autobahn schneller.",
            points: 0,
            feedback: "Du verteidigst das Problem, statt die Lösung zu zeigen.",
          },
        ],
      },
      {
        customerSay: "Die Transporter stehen nachts auf unserem Hof. Der gehört uns übrigens.",
        options: [
          {
            text: "Perfekt: eigener Hof, Fahrzeuge stehen nachts dort - ideal für Work Charging. Wallboxen, Installation über unser Team von The Mobility House, Verwaltung und Abrechnung über unsere Spirii-Software, zusammen mit Ihren Karten. Wann sollen denn weitere E-Fahrzeuge dazukommen?",
            points: 2,
            skill: "Quittung + offene Frage",
            dataKeys: ["own"],
            feedback:
              "Gebäudefrage erfasst (Eigentümer!), Lösung einfach erklärt, offene Frage zur Zeitschiene.",
          },
          {
            text: "Gut, ich schicke Ihnen mal ein paar Infos zu.",
            points: 1,
            feedback: "Infos statt Gespräch - so entsteht kein qualifizierter Lead.",
          },
          {
            text: "Dann brauchen Sie mindestens zehn Wallboxen mit 22 kW und Lastmanagement Typ B.",
            points: 0,
            feedback:
              "Zu technisch und ungefragt dimensioniert - einfache Argumente, Details klärt der Experte.",
          },
        ],
      },
      {
        customerSay:
          "Nächstes Jahr sollen fünf weitere Diesel ersetzt werden. Aber ehrlich: Das ist uns alles zu kompliziert mit Installation und Abrechnung.",
        options: [
          {
            text: "Verstehe, der Aufwand macht Ihnen Sorgen. Genau den nehmen wir Ihnen ab: ein Ansprechpartner für Beratung, Installation und Abrechnung - alles auf der Rechnung, die Sie schon kennen. Was wäre Ihnen lieber: erst ein unverbindliches Angebot oder ein Gespräch mit unserem Ladeinfrastruktur-Experten?",
            points: 2,
            skill: "Einwandbehandlung",
            dataKeys: ["ready"],
            feedback:
              "Einwand quittiert, Nutzen einfach, Alternativfrage führt direkt zum Ziel (Angebot oder Beratung).",
          },
          {
            text: "Das ist gar nicht kompliziert, das machen wir ständig.",
            points: 1,
            feedback: "Widerspruch ohne Quittung - der Kunde fühlt sich nicht ernst genommen.",
          },
          {
            text: "Dann warten wir besser noch ein Jahr.",
            points: 0,
            feedback:
              "Du gibst den 'Perfect Spot' auf - fünf neue EV kommen nächstes Jahr!",
          },
        ],
      },
      {
        customerSay: "Ein Gespräch mit einem Experten klingt gut.",
        options: [
          {
            text: "Sehr gerne! Ich fasse zusammen: 14 Fahrzeuge, drei E-Transporter, fünf weitere geplant, eigener Hof, bisher nur Road. Unser Experte meldet sich für die Work-Charging-Beratung - passt Ihnen Donnerstag?",
            points: 2,
            skill: "Quittung + Abschluss",
            dataKeys: ["next"],
            feedback:
              "Abschluss-Quittung plus konkreter Termin: qualifizierter Lead erreicht.",
          },
          {
            text: "Okay, es meldet sich dann irgendwann jemand.",
            points: 1,
            feedback: "Ohne konkreten Termin versandet der Lead.",
          },
          {
            text: "Ich lege direkt eine Bestellung über zehn Wallboxen an.",
            points: 0,
            feedback: "Es gibt noch kein Angebot und keine Begehung - Prozess einhalten.",
          },
        ],
      },
    ],
  },
  {
    id: "s2",
    combo: "Work vorhanden + Fremd-Management",
    title: "Logistiker: Wallboxen mit Wettbewerber-Backend abloesen",
    persona:
      "Herr Okafor, Fuhrparkleiter Logistik, 40 Fahrzeuge, davon 12 E-Dienstwagen. Salesforce: Karten-Kunde, Wallboxen am Standort vermerkt, Anbieter unbekannt.",
    targets: ["comp", "wb", "total", "mix", "ready", "own", "next"],
    outcome:
      "Opportunity anlegen (4a): Migration/Abloesung des Wallbox-Managements. Bestandsaufnahme durch den Experten ist terminiert.",
    steps: [
      {
        customerSay: "Die Karten laufen. Aber Ladesäulen haben wir schon - da brauchen wir nichts.",
        options: [
          {
            text: "Dann sind Sie ja ganz vorne dabei - gut, dass Sie das gleich sagen! Das heißt, Sie kennen sich schon aus: Welchen Anbieter nutzen Sie denn aktuell für Verwaltung und Abrechnung der Ladepunkte?",
            points: 2,
            skill: "Quittungsmethode",
            feedback:
              "Musterbeispiel der Quittungsmethode: Einwand wertschätzend aufgenommen, Kunde bestätigt ('ganz vorne dabei'), offene Frage - aus dem Einwand wird der Einstieg ins Migrationsgespräch.",
          },
          {
            text: "Von welchem Hersteller sind die denn?",
            points: 1,
            feedback:
              "Sammelt zwar Daten, aber ohne Wertschätzung und Bestätigung wirkt es verhörartig - erst quittieren, dann fragen.",
          },
          {
            text: "Ah, okay. Schade.",
            points: 0,
            feedback:
              "Aufgeben beim ersten Einwand - die Quittungsmethode hätte das Gespräch geöffnet.",
          },
        ],
      },
      {
        customerSay:
          "Läuft über ChargePro. Die Abrechnung fürs Heimladen der Dienstwagen ist aber ehrlich gesagt ein Krampf.",
        options: [
          {
            text: "Verstehe: Management über ChargePro, und gerade die Heimstrom-Erstattung macht Aufwand. Wie läuft das heute konkret ab?",
            points: 2,
            skill: "Quittung + offene Frage",
            dataKeys: ["comp", "wb"],
            feedback: "Wettbewerber notiert (Battlecard!), Schmerzpunkt quittiert, offene Frage vertieft.",
          },
          {
            text: "Und wie viele Wallboxen sind es insgesamt?",
            points: 1,
            dataKeys: ["wb"],
            feedback:
              "Wichtige Zahl, aber du überspringst den Schmerzpunkt - erst quittieren, dann zählen.",
          },
          {
            text: "ChargePro? Die sind nicht so gut, hört man.",
            points: 0,
            feedback: "Nie schlecht über Wettbewerber reden - Fakten statt Lästern.",
          },
        ],
      },
      {
        customerSay:
          "Die Fahrer reichen Zählerfotos ein und die Buchhaltung tippt alles ab. Bei 12 Dienstwagen, jeden Monat.",
        options: [
          {
            text: "Also manuelle Erfassung für 12 Fahrer, Monat für Monat - das kostet Zeit und Genauigkeit. Genau das automatisieren wir: geeichte Messung, automatische Erstattung, alles auf Ihrer bestehenden Rechnung bei uns. Wie viele Ihrer 40 Fahrzeuge sollen denn in den nächsten Jahren noch elektrisch werden?",
            points: 2,
            skill: "Quittung + offene Frage",
            feedback: "Schmerz quittiert, Nutzen ohne Technik, offene Frage zur Transformation.",
          },
          {
            text: "Das können wir auch, und besser.",
            points: 1,
            feedback: "Behauptung ohne Nutzenbild - was genau wird für den Kunden besser?",
          },
          {
            text: "Zählerfotos? Das ist ja Steinzeit.",
            points: 0,
            feedback: "Du machst die heutige Lösung des Kunden lächerlich - er hat sie ausgewählt.",
          },
        ],
      },
      {
        customerSay:
          "Der Plan ist: bis übernächstes Jahr die Hälfte der 40 Fahrzeuge. Aber ein Systemwechsel ist doch riskant.",
        options: [
          {
            text: "Berechtigter Punkt - niemand will einen Bruch im Betrieb. Deshalb übernehmen wir bestehende Wallboxen einfach in unser Management: Die Hardware bleibt, nur Software und Abrechnung wechseln, ohne Umbau. Was müsste ein neues System können, damit sich der Wechsel für Sie lohnt?",
            points: 2,
            skill: "Einwandbehandlung",
            dataKeys: ["total", "mix", "ready"],
            feedback:
              "Kern der Migration: Hardware bleibt, Management wechselt. Einwand quittiert, offene Frage öffnet die Kriterien.",
          },
          {
            text: "Da gibt es überhaupt kein Risiko.",
            points: 1,
            feedback: "Pauschale Beruhigung ohne Quittung überzeugt nicht.",
          },
          {
            text: "Dann bleiben Sie halt bei ChargePro.",
            points: 0,
            feedback: "Der Einwand war eine Einladung, kein Abschied.",
          },
        ],
      },
      {
        customerSay: "Eine Rechnung für alles wäre tatsächlich gut. Das Gebäude gehört übrigens unserer Muttergesellschaft.",
        options: [
          {
            text: "Notiert: Gebäude gehört zur Muttergesellschaft - das klären wir in der Beratung gleich mit. Und der wichtigste Punkt für Sie ist die eine Rechnung für Tanken, Road und Wallboxen. Habe ich das richtig zusammengefasst?",
            points: 2,
            skill: "Quittung",
            dataKeys: ["own"],
            feedback: "Eigentümerfrage erfasst, Hauptmotiv quittiert und bestätigen lassen.",
          },
          {
            text: "Mietverhältnisse machen es immer kompliziert.",
            points: 1,
            feedback: "Problem betont statt Lösung - die Beratung klärt das doch.",
          },
          {
            text: "Okay.",
            points: 0,
            feedback: "Zwei wichtige Informationen einfach verschenkt.",
          },
        ],
      },
      {
        customerSay: "Ja, genau so. Wie geht's jetzt weiter?",
        options: [
          {
            text: "Mein Vorschlag: Unser Experte macht eine kurze Bestandsaufnahme Ihrer Ladepunkte und rechnet Ihnen die Ablösung unverbindlich durch. Welcher Tag nächste Woche passt Ihnen?",
            points: 2,
            skill: "Abschluss",
            dataKeys: ["next"],
            feedback: "Konkreter nächster Schritt mit Terminfrage - qualifizierter Migrations-Lead.",
          },
          {
            text: "Ich schicke Ihnen eine Broschüre.",
            points: 1,
            feedback: "Papier ersetzt keinen Termin.",
          },
          {
            text: "Ich melde mich in einem halben Jahr wieder.",
            points: 0,
            feedback: "Der Kunde ist jetzt bereit - nicht vertagen.",
          },
        ],
      },
    ],
  },
  {
    id: "s3",
    combo: "Perfect Spot: EV bestellt, keine Lösung",
    title: "Pflegedienst: 4 E-Autos kommen, Standort gemietet",
    persona:
      "Frau Yildiz, Inhaberin eines Pflegedienstes, 9 PKW. Salesforce: Kartenkundin, Notiz 'E-Autos bestellt?'. Standort vermutlich gemietet.",
    targets: ["mix", "ready", "own", "total", "need", "next"],
    outcome:
      "Opportunity anlegen (4a): Acquisition Home + Work. Expertenberatung vor der Fahrzeuglieferung ist terminiert.",
    steps: [
      {
        customerSay:
          "Wir haben tatsächlich gerade vier E-Autos bestellt, die kommen in acht Wochen. Ums Laden haben wir uns noch keine Gedanken gemacht.",
        options: [
          {
            text: "Dann ist das perfektes Timing: vier E-Autos in acht Wochen, Ladelösung noch offen. Wo werden die Fahrzeuge denn nachts stehen - bei den Fahrerinnen zuhause oder am Standort?",
            points: 2,
            skill: "Quittung + offene Frage",
            dataKeys: ["mix", "ready"],
            feedback: "'Perfect Spot' erkannt und quittiert, offene Frage klärt Home vs. Work.",
          },
          {
            text: "Dann sollten Sie schnell Wallboxen kaufen.",
            points: 1,
            feedback: "Druck statt Analyse - erst verstehen, wo geladen wird.",
          },
          {
            text: "Acht Wochen? Das wird zeitlich eng.",
            points: 0,
            feedback: "Angst erzeugen ist kein Verkaufen - Timing ist machbar und du bist die Lösung.",
          },
        ],
      },
      {
        customerSay:
          "Meist bei den Mitarbeiterinnen zuhause, zwei Autos stehen bei uns. Unser Büro ist allerdings nur gemietet.",
        options: [
          {
            text: "Also überwiegend Home Charging, zwei Fahrzeuge am gemieteten Standort - danke. Für zuhause installieren wir Wallboxen bei Ihren Mitarbeiterinnen inklusive automatischer Stromerstattung. Für den Standort klären wir die Zustimmung des Vermieters, das übernimmt unsere Beratung. Wie viele Fahrzeuge fahren bei Ihnen insgesamt?",
            points: 2,
            skill: "Quittung + offene Frage",
            dataKeys: ["own"],
            feedback:
              "Mieter-Situation erfasst und als lösbar eingeordnet, Lösung einfach erklärt, offene Frage zur Flotte.",
          },
          {
            text: "Zuhause laden ist zum Glück ganz einfach.",
            points: 1,
            feedback: "Stimmt, aber Quittung und die Vermieterfrage fehlen.",
          },
          {
            text: "Gemietet? Dann geht am Standort leider nichts.",
            points: 0,
            feedback: "Falsch - mit Vermieterzustimmung geht sehr wohl etwas. Nie vorschnell Türen schließen.",
          },
        ],
      },
      {
        customerSay:
          "Neun insgesamt, der Rest sind Benziner. Was kostet denn so eine Wallbox bei den Mitarbeiterinnen?",
        options: [
          {
            text: "Gute Frage - das hängt vor allem von der Installation vor Ort ab, deshalb nennt Ihnen unser Experte nach einem kurzen Check eine verlässliche Zahl. Wichtiger für Sie: Die Erstattung des Ladestroms läuft automatisch, ganz ohne Zettelwirtschaft. Welche Rolle spielen für Sie eigentlich steuerliche Themen beim Umstieg?",
            points: 2,
            skill: "Offene Frage",
            dataKeys: ["total"],
            feedback: "Flottengröße erfasst, Preisfrage seriös zum Experten geführt, offene Frage öffnet das Beratungsthema.",
          },
          {
            text: "Mit Installation meist zwischen 1.500 und 2.500 Euro, je nach Kabelweg.",
            points: 1,
            dataKeys: ["total"],
            feedback: "Ehrliche Spanne ist okay - aber die Anschlussfrage fehlt, das Gespräch stockt.",
          },
          {
            text: "Das kann ich Ihnen nicht sagen.",
            points: 0,
            feedback: "Hilflos statt souverän - Spanne oder Experten-Check anbieten.",
          },
        ],
      },
      {
        customerSay: "Steuern? Da haben wir ehrlich gesagt keine Ahnung, da bräuchten wir wohl Hilfe.",
        options: [
          {
            text: "Verstehe - Beratungsbedarf bei Steuern und Recht nehme ich mit auf, genau dafür haben wir Experten. Ich fasse zusammen: neun Fahrzeuge, vier E-Autos in acht Wochen, Laden vor allem zuhause, Standort gemietet, Beratungsbedarf bei Steuern. Passt das so?",
            points: 2,
            skill: "Quittung",
            dataKeys: ["need"],
            feedback: "Bedarf erfasst und komplette Abschluss-Quittung - Datenqualität gesichert.",
          },
          {
            text: "Okay, habe ich notiert.",
            points: 1,
            feedback: "Notiert ist gut, quittiert ist besser - Zusammenfassung bestätigen lassen.",
          },
          {
            text: "Steuern macht doch Ihr Steuerberater.",
            points: 0,
            feedback: "Du schickst den Bedarf zur Konkurrenz statt zur eigenen Beratung.",
          },
        ],
      },
      {
        customerSay: "Ja, das passt genau so.",
        options: [
          {
            text: "Dann vereinbaren wir direkt die Expertenberatung, damit die Wallboxen stehen, bevor die Autos kommen. Passt Ihnen diese oder nächste Woche besser?",
            points: 2,
            skill: "Abschluss",
            dataKeys: ["next"],
            feedback: "Alternativfrage zum Termin, Dringlichkeit positiv begründet - Lead qualifiziert.",
          },
          {
            text: "Ich schicke Ihnen ein Standard-Angebot.",
            points: 1,
            feedback: "Ohne Begehung kein seriöses Angebot - der Prozess sieht die Beratung vor.",
          },
          {
            text: "Rufen Sie doch wieder an, wenn die Autos da sind.",
            points: 0,
            feedback: "In acht Wochen ist es zu spät - die Lösung muss vor den Autos stehen.",
          },
        ],
      },
    ],
  },
  {
    id: "s4",
    combo: "Fuel only, keine EV",
    title: "Bauunternehmen: Diesel-Flotte, keine Pläne",
    persona:
      "Herr Brandt, Geschäftsführer Bauunternehmen. Salesforce: Tankkarten-Kunde, keine EV-Daten. Ziel hier: Daten erfassen, Follow-up setzen (Schritt 4b).",
    targets: ["total", "mix", "ready", "next", "us"],
    outcome:
      "Keine Opportunity (4b): Account vollständig pflegen (Flottendaten, Zeithorizont, Anbieter) und Follow-up in 6 Monaten setzen.",
    steps: [
      {
        customerSay: "E-Autos? Auf dem Bau? Das ist nichts für uns.",
        options: [
          {
            text: "Verstehe - für Ihre Einsätze sehen Sie aktuell keinen Platz für E-Fahrzeuge. Aus Interesse: Wie setzt sich Ihre Flotte denn heute zusammen?",
            points: 2,
            skill: "Quittung + offene Frage",
            feedback: "Einwand quittiert statt widersprochen, offene Frage hält das Gespräch am Laufen.",
          },
          {
            text: "Auch nicht bei den PKW der Bauleiter?",
            points: 1,
            feedback: "Guter Gedanke, aber geschlossen gefragt und ohne Quittung.",
          },
          {
            text: "Doch, E-Transporter sind heute super!",
            points: 0,
            feedback: "Direkter Widerspruch ohne Quittung - der Kunde macht zu.",
          },
        ],
      },
      {
        customerSay: "22 Fahrzeuge: acht PKW für die Bauleiter, zehn Transporter, vier LKW. Alles Diesel.",
        options: [
          {
            text: "Danke - 22 Fahrzeuge: acht PKW, zehn Transporter, vier LKW, alle Diesel. Viele Betriebe starten übrigens bei den Bauleiter-PKW, wegen der günstigen Dienstwagenbesteuerung. Gibt es bei Ihnen schon Überlegungen oder eine Zeitplanung Richtung E-Fahrzeuge?",
            points: 2,
            skill: "Quittung + offene Frage",
            dataKeys: ["total", "mix"],
            feedback: "Vollständige Quittung der Flottendaten, einfacher Impuls, offene Frage zur Planung.",
          },
          {
            text: "Und wie alt sind die Fahrzeuge im Schnitt?",
            points: 1,
            feedback: "Auch interessant, aber die Transformationsfrage ist jetzt wichtiger.",
          },
          {
            text: "Diesel wird sowieso bald verboten.",
            points: 0,
            feedback: "Drohkulisse statt Beratung - unseriös und inhaltlich wacklig.",
          },
        ],
      },
      {
        customerSay: "Die Geschäftsführung hat mal drüber gesprochen, aber konkret ist nichts. Frühestens in zwei Jahren.",
        options: [
          {
            text: "Alles klar: heute kein Thema, Horizont etwa zwei Jahre. Dann halte ich das genau so fest und melde mich rechtzeitig vor Ihren nächsten Fahrzeugentscheidungen. Wäre ein kurzes Update in sechs Monaten für Sie in Ordnung?",
            points: 2,
            skill: "Quittung + Abschluss",
            dataKeys: ["ready"],
            feedback: "Kein Druck: Zeithorizont quittiert, Follow-up vorgeschlagen - genau Schritt 4b.",
          },
          {
            text: "Soll ich Ihnen trotzdem schon ein Angebot schicken?",
            points: 1,
            feedback: "Ohne Bedarf kein Angebot - das entwertet eure Angebote.",
          },
          {
            text: "In zwei Jahren anzufangen ist definitiv zu spät.",
            points: 0,
            feedback: "Belehrung erzeugt Widerstand - der Kunde bestimmt sein Tempo.",
          },
        ],
      },
      {
        customerSay: "Ja, melden Sie sich in einem halben Jahr gern wieder.",
        options: [
          {
            text: "Mache ich, der Termin ist notiert. Eine letzte Frage für unsere Unterlagen: Nutzen Sie neben unseren Tankkarten noch Services anderer Anbieter?",
            points: 2,
            skill: "Offene Datenfrage",
            dataKeys: ["next"],
            feedback: "Follow-up gesichert und die Datenerfassung komplettiert - Wettbewerbsinfo ist Gold wert.",
          },
          {
            text: "Gut, dann tschüss!",
            points: 1,
            feedback: "Freundlich, aber eine Datenchance verschenkt.",
          },
          {
            text: "Ich rufe sicherheitshalber nächste Woche nochmal an.",
            points: 0,
            feedback: "Vereinbarung ignoriert - das nervt und verbrennt den Lead.",
          },
        ],
      },
      {
        customerSay: "Nein, nur Ihre Karten - sonst nichts.",
        options: [
          {
            text: "Danke für die offenen Infos! Ich trage alles in den Account ein: Flottendaten, Zeithorizont zwei Jahre, nur unsere Karten im Einsatz, Follow-up in sechs Monaten - ohne Opportunity, aber vollständig dokumentiert.",
            points: 2,
            skill: "Prozess (4b)",
            dataKeys: ["us"],
            feedback: "Genau richtig: kein Bedarf heute heißt Account pflegen statt Opportunity anlegen.",
          },
          {
            text: "Die Daten trage ich später ein, wenn ich Zeit habe.",
            points: 1,
            feedback: "Später heißt oft nie - Datenpflege gehört direkt nach den Call.",
          },
          {
            text: "Ich lege sicherheitshalber trotzdem eine Opportunity an.",
            points: 0,
            feedback:
              "Ohne konkreten Bedarf keine Opportunity - das verfälscht den Forecast (Schritt 4b!).",
          },
        ],
      },
    ],
  },
];
