// Support knowledge from the "Telefonie Support" Teams chat (UTA hotline),
// anonymized. Domain content stays in German. `caseRef` is a search term that
// jumps to the matching row(s) in CASES (case-search-data.ts) instead of
// duplicating queue/category info here.

export interface SupportEntry {
  id: string;
  kategorie: string;
  titel: string;
  stichworte: string[];
  antwort: string;
  stand: string;
  caseRef?: string;
}

export const SUPPORT_ENTRIES: SupportEntry[] = [
  {
    id: "regel-case-zuerst",
    kategorie: "Regeln",
    titel: "Case oder Chat?",
    stichworte: ["case", "chat", "notfall", "eskalieren", "teams"],
    antwort:
      "Immer zuerst einen Case anlegen. In den Chat nur echte Notfälle: Fahrzeuge stehen oder der Fahrer ist an der Tankstelle. Alles andere: Kunden um Geduld bitten (first in, first out).",
    stand: "2026-07-24",
  },
  {
    id: "regel-case-weitergeben",
    kategorie: "Regeln",
    titel: "Case nicht selbst behalten",
    stichworte: ["case owner", "queue", "weiterleiten", "anleger"],
    antwort:
      "Den Case immer an die Queue „DEU Customer Care“ oder die passende Fachabteilung geben. Bleibst du selbst Owner, sieht ihn niemand.",
    stand: "2026-09-17",
  },
  {
    id: "regel-case-inhalt",
    kategorie: "Regeln",
    titel: "Was muss in den Case?",
    stichworte: ["case inhalt", "betreff", "pflichtangaben"],
    antwort:
      "Kundennummer, Ansprechpartner (Name und Kontakt) und den konkreten Grund. Der Betreff sagt, worum es geht, z. B. „Limit-Erhöhungsanfrage“ oder „Zahlungsnachweis“, nicht nur „bitte bearbeiten“.",
    stand: "2026-09-09",
  },
  {
    id: "regel-grosskunden",
    kategorie: "Regeln",
    titel: "Großkunden (Field/Key/Channel)",
    stichworte: ["field", "großkunde", "betreuer", "chatter"],
    antwort:
      "Nur Cases an den Betreuer, keine Teams-Nachrichten. Ist es dringend: im Salesforce-Chatter den Betreuer mit @ markieren.",
    stand: "2026-09-03",
  },
  {
    id: "regel-daumen",
    kategorie: "Regeln",
    titel: "Fall im Chat übernommen",
    stichworte: ["daumen hoch", "übernommen", "reaktion"],
    antwort: "Wer einen Fall im Chat übernimmt, reagiert mit Daumen hoch.",
    stand: "2026-07-22",
  },
  {
    id: "regel-pruefen-vorher",
    kategorie: "Regeln",
    titel: "Vor dem Posten prüfen",
    stichworte: ["puma", "asp", "doppelter case", "collection"],
    antwort:
      "Vorher klären: Gibt es schon einen Case (dann ergänzen)? Ist es ein Field-Kunde (PUMA)? Liegt das Konto bei Collection? Ist es ein Prepaid-Kunde?",
    stand: "2026-10-21",
  },
  {
    id: "regel-puma-asp",
    kategorie: "Regeln",
    titel: "Wer betreut den Kunden?",
    stichworte: ["puma", "asp", "ansprechpartner", "ln references"],
    antwort:
      "Feld „PUMA LN References“: Steht dort „Customer Care“, ist das CC zuständig. Steht dort ein Name, ist das der persönliche Ansprechpartner.",
    stand: "2026-09-22",
  },
  {
    id: "komm-zahlungsprobleme",
    kategorie: "Regeln",
    titel: "Was sagen bei Zahlungsproblemen?",
    stichworte: ["kommunikation", "zahlungsprobleme", "fahrer", "pleite"],
    antwort:
      "Bei ungeklärten Fällen von einer technischen Störung sprechen. Offene Rechnungen nur nennen, wenn das 100 % sicher ist.",
    stand: "2026-07-20",
  },
  {
    id: "komm-keine-tarife",
    kategorie: "Regeln",
    titel: "Keine Tarife oder Rabatte versprechen",
    stichworte: ["tarif", "rabatt", "silber", "gold", "vm anbieten"],
    antwort:
      "Keine Pakete oder Rabatte erfinden („Silber“, „Gold“ gibt es nicht). Das Vorschussmodell (VM) nicht von sich aus anbieten; vorher mit Credit klären.",
    stand: "2026-09-08",
  },
  {
    id: "komm-interne-kontakte",
    kategorie: "Regeln",
    titel: "Interne Kontakte nicht weitergeben",
    stichworte: ["durchwahl", "outlook", "anwalt", "telefonnummer"],
    antwort:
      "Keine internen Durchwahlen, keine persönlichen E-Mail-Adressen und keine Telefonnummer des Anwalts an Kunden geben.",
    stand: "2026-07-30",
  },
  {
    id: "komm-zusagen",
    kategorie: "Regeln",
    titel: "Nichts zusagen, was nicht sicher ist",
    stichworte: ["zusage", "2-3 tage", "versprechen"],
    antwort:
      "Zum Beispiel nicht „in 2–3 Tagen geht die Karte wieder“. Mehrfach war der Kunde danach endgültig gesperrt.",
    stand: "2026-08-14",
  },
  {
    id: "komm-rechnung-mitarbeiter",
    kategorie: "Regeln",
    titel: "Mitarbeiter will eigene Rechnung",
    stichworte: ["mitarbeiter", "firmenkarte", "rechnung", "datenschutz"],
    antwort:
      "Keine Rechnung an einzelne Mitarbeiter. Sie sollen sich an die eigene Buchhaltung wenden.",
    stand: "2026-10-12",
  },
  {
    id: "komm-portal-unterwegs",
    kategorie: "Regeln",
    titel: "Kunde unterwegs, braucht Transaktionen",
    stichworte: ["transaktion", "fehlbetankung", "unterwegs", "portal"],
    antwort:
      "Nicht nur aufs Portal verweisen. Selbst nachsehen oder über CC gehen. Es gab eine schwere Beschwerde wegen eines solchen Verweises.",
    stand: "2026-07-17",
  },
  {
    id: "vr-request",
    kategorie: "Limit & VR",
    titel: "Limit erhöhen (Request)",
    stichworte: ["limit", "vr", "erhöhen", "request", "credit request"],
    antwort:
      "Button „Credit Request“ in Salesforce nutzen. Oft ist dann kein Case an Credit nötig. Immer den Bedarf in Euro abfragen.",
    stand: "2026-07-30",
    caseRef: "Limit change",
  },
  {
    id: "vr-fail",
    kategorie: "Limit & VR",
    titel: "Request zeigt „Fail“",
    stichworte: ["fail", "fehlermeldung", "rot", "pflichtfelder"],
    antwort:
      "Im Account fehlen Pflichtfelder. Die markierten Felder mit mindestens „1“ befüllen, dann klappt es.",
    stand: "2026-09-03",
    caseRef: "Limit check",
  },
  {
    id: "vr-pending",
    kategorie: "Limit & VR",
    titel: "Request bleibt auf „Pending“",
    stichworte: ["pending", "teilbetrag", "sicherheit"],
    antwort:
      "Case an Credit stellen. Wird nur ein Teil genehmigt, die Differenz als Sicherheit (Kaution) anfragen.",
    stand: "2026-07-22",
  },
  {
    id: "vr-null",
    kategorie: "Limit & VR",
    titel: "VR plötzlich auf 0 oder 2 €",
    stichworte: ["0 euro", "2 euro", "runtergesetzt", "bonität", "crefo"],
    antwort:
      "Meist schlechtere Bonität oder eine offene bzw. überfällige Rechnung. Kunden werden darüber aktuell nicht informiert. Tipp: eine Limit-Benachrichtigung im Portal einrichten.",
    stand: "2026-09-14",
    caseRef: "Credit Limit",
  },
  {
    id: "vr-kaution",
    kategorie: "Limit & VR",
    titel: "Mehr Limit nur gegen Kaution",
    stichworte: ["kaution", "vollabsicherung", "sicherheitsvereinbarung"],
    antwort:
      "Bei schlechter Bonität gilt Kaution = Limit. Erhöhung nur mit zusätzlicher Kaution **und** unterschriebener Sicherheitsvereinbarung. Drohungen ändern daran nichts.",
    stand: "2026-09-11",
    caseRef: "Securities",
  },
  {
    id: "vr-field",
    kategorie: "Limit & VR",
    titel: "Limit bei Field-Kunden",
    stichworte: ["field", "limit", "betreuer"],
    antwort: "Immer an den Betreuer bzw. dessen Vertretung. Ist niemand da: fieldaccount@uta.com.",
    stand: "2026-07-30",
  },
  {
    id: "vr-woechentlich",
    kategorie: "Limit & VR",
    titel: "VR reicht bis zur Abbuchung nicht",
    stichworte: ["wöchentlich", "abrechnung", "zahlungsziel", "12 tage"],
    antwort:
      "Entweder den VR erhöhen oder auf wöchentliche Abrechnung umstellen (Case). Bis zur Abbuchung bleibt der Rahmen gebunden.",
    stand: "2026-09-29",
  },
  {
    id: "karte-velocity",
    kategorie: "Karte abgelehnt",
    titel: "TXN_VELOCITY_EXCEEDED",
    stichworte: ["velocity", "trs0176", "kartenlimit", "monatslimit", "monatsende"],
    antwort:
      "Das Monatslimit der einzelnen Karte ist erreicht (Standard ca. 1.500–2.000 €). Cards erhöht es, oder der Kunde ändert es selbst im Portal. Das ist nicht der VR des Kontos.",
    stand: "2026-08-31",
    caseRef: "Fraud",
  },
  {
    id: "karte-vr-frei",
    kategorie: "Karte abgelehnt",
    titel: "„Limit überschritten“, aber VR ist frei",
    stichworte: ["limit überschritten", "vr frei", "tageslimit"],
    antwort:
      "Dann liegt es am Karten- oder Tageslimit (z. B. 4 Nutzungen bzw. 2.000 € pro Tag). Cards anrufen oder an cards@uta.com.",
    stand: "2026-07-22",
  },
  {
    id: "karte-pin",
    kategorie: "Karte abgelehnt",
    titel: "Falsche PIN",
    stichworte: ["pin", "kasse"],
    antwort: "Paytech zeigt eine falsche PIN-Eingabe. Fahrer bzw. Kasse noch mal versuchen lassen.",
    stand: "2026-08-31",
    caseRef: "PIN",
  },
  {
    id: "karte-gesperrt-benutzt",
    kategorie: "Karte abgelehnt",
    titel: "Gesperrte bzw. alte Karte benutzt",
    stichworte: ["gesperrte karte", "alte karte", "neue karte"],
    antwort:
      "Der Kunde hat eine gesperrte oder abgelaufene Karte eingesetzt. Auf die aktive Karte hinweisen.",
    stand: "2026-10-07",
  },
  {
    id: "karte-einzeln",
    kategorie: "Karte abgelehnt",
    titel: "Nur eine Karte oder eine Tankstelle betroffen",
    stichworte: ["magnetstreifen", "lesegerät", "tankstelle", "erneut versuchen"],
    antwort:
      "Magnetstreifen beschädigt oder Lesegerät hängt. Erneut versuchen, Karte prüfen. Immer Kartennummer, Tankstelle und Uhrzeit aufnehmen.",
    stand: "2026-07-29",
  },
  {
    id: "karte-produkt",
    kategorie: "Karte abgelehnt",
    titel: "„Produkt nicht zugelassen“",
    stichworte: ["produktbeschränkung", "wäsche", "produktgruppen"],
    antwort:
      "Produktbeschränkung der Karte; der Kunde stellt sie im Portal ein. Eine Excel-Liste der Produktgruppen gibt es bei CC.",
    stand: "2026-08-14",
  },
  {
    id: "karte-altsystem",
    kategorie: "Karte abgelehnt",
    titel: "Änderung greift nicht sofort",
    stichworte: ["altes system", "übertragung", "13:30"],
    antwort:
      "Bei Kunden aus dem alten System werden Änderungen verzögert übertragen, meist bis ca. 13:30 Uhr.",
    stand: "2026-08-31",
    caseRef: "Card wasn",
  },
  {
    id: "karte-stoerung",
    kategorie: "Karte abgelehnt",
    titel: "Viele Kunden gleichzeitig betroffen",
    stichworte: ["störung", "paytech", "ausfall", "viele kunden"],
    antwort:
      "Im Chat nachfragen, ob eine Störung bekannt ist. Beispiele für Kunden sammeln (Kundennummer, Karte, Uhrzeit). Tankstellen nutzen die manuelle Freigabe.",
    stand: "2026-10-09",
  },
  {
    id: "pp-minus",
    kategorie: "Prepaid",
    titel: "Minus im Portal bei Prepaid",
    stichworte: ["prepaid", "minus", "guthaben", "vsm", "vm"],
    antwort:
      "Ein Minus ist bei Prepaid Guthaben, keine Schuld. Ist das Guthaben aufgebraucht, braucht es eine neue Vorauskasse.",
    stand: "2026-09-03",
  },
  {
    id: "pp-verbuchung",
    kategorie: "Prepaid",
    titel: "Überweisung noch nicht da",
    stichworte: ["echtzeit", "verbuchung", "3-4 tage", "beschleunigen"],
    antwort:
      "Die Verbuchung dauert 3–4 Werktage, auch bei Echtzeitüberweisung. Beschleunigen ist nicht möglich.",
    stand: "2026-08-24",
  },
  {
    id: "pp-beleg",
    kategorie: "Prepaid",
    titel: "Zahlung nicht auffindbar",
    stichworte: ["beleg", "zahlungsnachweis", "service.finanz"],
    antwort:
      "Der Kunde schickt den Überweisungsbeleg an service.finanz@uta.com. Ohne Beleg kann niemand suchen.",
    stand: "2026-07-24",
  },
  {
    id: "pp-falsche-kdnr",
    kategorie: "Prepaid",
    titel: "Falsche Kundennummer bei Überweisung",
    stichworte: ["falsche kundennummer", "verwendungszweck", "umbuchen"],
    antwort:
      "Beleg anfordern, die Buchhaltung bucht um. Künftig immer die Kundennummer in den Verwendungszweck.",
    stand: "2026-09-14",
  },
  {
    id: "pp-dritte",
    kategorie: "Prepaid",
    titel: "Zahlung von einem anderen Konto",
    stichworte: ["drittzahlung", "geldwäsche", "anderes konto"],
    antwort: "Nicht erlaubt (Geldwäschegesetz). Nur Zahlungen vom eigenen Firmenkonto.",
    stand: "2026-07-31",
  },
  {
    id: "pp-rechnung",
    kategorie: "Prepaid",
    titel: "Prepaid-Kunde überweist Rechnungen",
    stichworte: ["prepaid", "rechnung überweisen"],
    antwort:
      "Das ergibt keinen Sinn. Prepaid heißt: Guthaben einzahlen, die Rechnungen werden damit verrechnet.",
    stand: "2026-07-16",
  },
  {
    id: "sperre-endgueltig",
    kategorie: "Sperre & Inkasso",
    titel: "Komplett gesperrt",
    stichworte: ["komplett gesperrt", "nka", "neukundenantrag", "entsperren"],
    antwort:
      "Die Sperre ist endgültig. Der Kunde muss einen Neukundenantrag (NKA) stellen; dann wird neu geprüft. Keinen Case an Credit.",
    stand: "2026-08-14",
    caseRef: "Complete blocking",
  },
  {
    id: "sperre-frist",
    kategorie: "Sperre & Inkasso",
    titel: "Bezahlt, aber zu spät",
    stichworte: ["letzte frist", "zahlungsaufforderung", "zu spät"],
    antwort:
      "In der letzten Zahlungsaufforderung steht die Frist mit Hinweis auf Komplettsperre. Wer danach zahlt, bleibt gesperrt.",
    stand: "2026-07-20",
    caseRef: "Termination",
  },
  {
    id: "sperre-collection",
    kategorie: "Sperre & Inkasso",
    titel: "Konto bei Collection oder Anwalt",
    stichworte: ["closing", "lawyer", "anwalt", "inkasso", "collection"],
    antwort:
      "Keine Auskunft geben. Satz: „Wir haben keine Einsicht mehr in Ihr Kundenkonto, die Kollegen melden sich.“ Intern an Collection weitergeben.",
    stand: "2026-08-11",
  },
  {
    id: "sperre-monitoring",
    kategorie: "Sperre & Inkasso",
    titel: "Status „Monitoring“",
    stichworte: ["monitoring"],
    antwort: "Der Kunde kann trotz offener Themen weiter tanken.",
    stand: "2026-07-03",
  },
  {
    id: "sperre-kaution-zurueck",
    kategorie: "Sperre & Inkasso",
    titel: "Kaution nach Kündigung",
    stichworte: ["kaution zurück", "kündigung", "auszahlung"],
    antwort:
      "Wird ausgezahlt, wenn alles abgerechnet ist und keine offenen Posten bestehen. Steht so in der Kündigungsbestätigung.",
    stand: "2026-08-05",
    caseRef: "Release of Security",
  },
  {
    id: "sperre-insolvenz",
    kategorie: "Sperre & Inkasso",
    titel: "Insolvenzfälle",
    stichworte: ["insolvenz", "insolvent"],
    antwort:
      "Insolvente Kunden, die weiter beliefert werden, in die eigene Queue für Insolvenzfälle. Insolvenzfälle mit Anwalt bekommen ihre Antwort vom UTA-Anwalt.",
    stand: "2026-08-12",
  },
  {
    id: "bank-aendern",
    kategorie: "Bank & SEPA",
    titel: "Bankverbindung ändern",
    stichworte: ["bankverbindung", "iban", "ändern", "sepa"],
    antwort:
      "Nur schriftlich per E-Mail, nie auf Zuruf. Pro Kundenkonto ist nur eine Bankverbindung möglich.",
    stand: "2026-09-23",
    caseRef: "Change of bank details",
  },
  {
    id: "bank-altes-konto",
    kategorie: "Bank & SEPA",
    titel: "Abbuchung vom alten Konto",
    stichworte: ["altes konto", "mandatsreferenz", "it ticket"],
    antwort:
      "Meist ist noch die alte Mandatsreferenz hinterlegt: IT-Ticket. Bis dahin überweist der Kunde manuell. Kommt die Änderung kurz vor dem Abbuchungstermin, wird noch vom alten Konto abgebucht.",
    stand: "2026-08-12",
  },
  {
    id: "bank-umfirmierung",
    kategorie: "Bank & SEPA",
    titel: "Umfirmierung",
    stichworte: ["umfirmierung", "firmenname", "gmbh", "neuer name"],
    antwort:
      "Das Konto bleibt bestehen, die Daten werden per E-Mail aktualisiert. Das neue SEPA-Mandat kommt erst nach Abschluss der Umfirmierung. Die Abteilung ist im Verzug.",
    stand: "2026-10-12",
    caseRef: "Legal name/legal form change",
  },
  {
    id: "bank-ruecklastschrift",
    kategorie: "Bank & SEPA",
    titel: "Rücklastschrift",
    stichworte: ["rücklastschrift", "retoure", "zweites mal abbuchen", "gebühr"],
    antwort:
      "Es wird kein zweites Mal abgebucht; der Kunde überweist. Die Gebühr kommt als Position auf eine spätere Abrechnung.",
    stand: "2026-10-12",
    caseRef: "direct debit rejected",
  },
  {
    id: "bank-uta-iban",
    kategorie: "Bank & SEPA",
    titel: "UTA-Konto für Überweisungen",
    stichworte: ["iban", "uta konto", "überweisen", "commerzbank"],
    antwort:
      "UNION TANK Eckstein GmbH & Co. KG, Commerzbank Aschaffenburg, IBAN DE47 7958 0099 0158 7882 01, BIC DRESDEFF795. Verwendungszweck: Kundennummer.",
    stand: "2026-08-13",
  },
  {
    id: "bank-doppelt",
    kategorie: "Bank & SEPA",
    titel: "Doppelt bezahlt",
    stichworte: ["doppelt bezahlt", "überwiesen und abgebucht", "rückzahlung"],
    antwort: "Geht an die Buchhaltung zur Rückzahlung bzw. Verrechnung.",
    stand: "2026-10-09",
  },
  {
    id: "bank-samstag",
    kategorie: "Bank & SEPA",
    titel: "Abbuchungstag ist ein Wochenende",
    stichworte: ["samstag", "abbuchung", "werktag"],
    antwort: "Abgebucht wird am nächsten Werktag.",
    stand: "2026-09-14",
  },
  {
    id: "portal-rechnungen",
    kategorie: "Portal & Apps",
    titel: "Rechnungen herunterladen",
    stichworte: ["rechnung", "download", "portal", "kostenlos"],
    antwort:
      "Im Portal jederzeit kostenlos. Bei migrierten Kunden fehlen ältere Jahre teilweise; dann schickt CC die Unterlagen.",
    stand: "2026-09-18",
  },
  {
    id: "portal-login",
    kategorie: "Portal & Apps",
    titel: "Login klappt nicht",
    stichworte: ["login", "passwort", "zugang", "anmelden"],
    antwort:
      "Oft die falsche Login-Seite (altes vs. neues Portal) oder eine andere E-Mail-Adresse als die hinterlegte. Eine E-Mail-Adresse gilt nur für ein Portal. Sonst Case an CC.",
    stand: "2026-07-22",
  },
  {
    id: "portal-weiss",
    kategorie: "Portal & Apps",
    titel: "Weißer Bildschirm, lädt endlos",
    stichworte: ["weiß", "lädt", "whitepage", "cookies"],
    antwort: "Cookies und Browserdaten von UTA löschen; prüfen, ob die Uhrzeit am Gerät stimmt.",
    stand: "2026-09-28",
  },
  {
    id: "portal-bestellung",
    kategorie: "Portal & Apps",
    titel: "Kartenbestellung: „Error“",
    stichworte: ["kartenbestellung", "error", "bestellen", "email"],
    antwort: "Bei der Bestellung eine andere E-Mail-Adresse als die des Logins angeben.",
    stand: "2026-09-23",
  },
  {
    id: "portal-limitinfo",
    kategorie: "Portal & Apps",
    titel: "Limit-Benachrichtigung einrichten",
    stichworte: ["info-limit", "benachrichtigung", "ausgabelimit"],
    antwort:
      "Altes Portal: Service Center → Benachrichtigungen. Neues Portal: Einstellungen → Abonnement & Tarif → Monatliches Ausgabelimit → „Limit-Benachrichtigung aktivieren/ändern“.",
    stand: "2026-09-14",
  },
  {
    id: "portal-uhrzeit",
    kategorie: "Portal & Apps",
    titel: "Wann wurde getankt?",
    stichworte: ["uhrzeit", "tankzeit", "transaktionen", "reporting"],
    antwort:
      "Service Center → Reporting → „nicht abgerechnete Transaktionen – Details“. Dort stehen Datum und Uhrzeit.",
    stand: "2026-08-24",
  },
  {
    id: "portal-stammtankstelle",
    kategorie: "Portal & Apps",
    titel: "Stammtankstellen festlegen",
    stichworte: ["stammtankstelle", "premium", "best price"],
    antwort: "Im alten Portal: Stationsfinder → Auswahl Stammtankstelle.",
    stand: "2026-07-08",
    caseRef: "Homebase change",
  },
  {
    id: "portal-umstellung",
    kategorie: "Portal & Apps",
    titel: "Wechsel ins neue Portal",
    stichworte: ["neues portal", "migration", "umstellen"],
    antwort:
      "Das entscheidet die IT. Der Kunde wird per E-Mail informiert; vorher lässt sich nichts umstellen.",
    stand: "2026-09-25",
  },
  {
    id: "portal-cardlock",
    kategorie: "Portal & Apps",
    titel: "Cardlock und EasyFuel",
    stichworte: ["cardlock", "easyfuel"],
    antwort:
      "Cardlock geht im alten und im neuen Portal. EasyFuel geht nur im alten Portal; migrierte Kunden können EasyFuel noch nicht registrieren.",
    stand: "2026-09-11",
  },
  {
    id: "portal-apps",
    kategorie: "Portal & Apps",
    titel: "Welche App wofür?",
    stichworte: ["app", "edenred drive", "echarge", "zugangsdaten"],
    antwort:
      "Edenred Drive (Stationssuche, auch ohne Login), eCharge-App (Ladekarte) und Kundenportal sind drei getrennte Zugänge. eCharge-Zugangsdaten gibt es nur, wenn sie bei der Kartenbestellung angefordert wurden; sonst ist eine neue Karte nötig.",
    stand: "2026-09-11",
  },
  {
    id: "portal-fahrspar",
    kategorie: "Portal & Apps",
    titel: "Fahr & Spar",
    stichworte: ["fahr und spar", "fahr & spar", "csv", "liste"],
    antwort:
      "Seit August 2025 eingestellt, ein Login ist nicht mehr möglich. Ein Nachfolger ist in Arbeit. Das Programm kostet nichts.",
    stand: "2026-09-15",
  },
  {
    id: "portal-neukunde",
    kategorie: "Portal & Apps",
    titel: "Neukunde ohne Zugangsdaten",
    stichworte: ["neukunde", "zugangsdaten", "prospect", "registrierung"],
    antwort:
      "Meist ist das Konto noch nicht aktiv oder steht auf „Prospect“: IT-Ticket bzw. an den Sales-Mitarbeiter.",
    stand: "2026-09-28",
  },
  {
    id: "re-kopie",
    kategorie: "Rechnungen",
    titel: "Rechnungskopie",
    stichworte: ["rechnungskopie", "duplikat", "fehlende rechnung"],
    antwort: "Case an Customer Care (CCDEU), nicht an Credit. Vorher auf das Portal hinweisen.",
    stand: "2026-08-21",
    caseRef: "Second original UTA invoice",
  },
  {
    id: "re-vat",
    kategorie: "Rechnungen",
    titel: "Umsatzsteuer und Erstattung",
    stichworte: ["mwst", "vat", "erstattung", "ust-id", "saldenbestätigung"],
    antwort:
      "Queue „HQ VAT & Indirect Tax“: Saldenbestätigung, Rechnungsregeln, Korrektur wegen Stammdaten, Duplikat, USt-ID, Erstattung im Ausland. Preise und Kartendaten → Complaints.",
    stand: "2026-08-31",
    caseRef: "VAT/Tax number support",
  },
  {
    id: "re-gebuehr-kuendigung",
    kategorie: "Rechnungen",
    titel: "Gebühren nach der Kündigung",
    stichworte: ["kartengebühr", "gekündigt", "abgebucht"],
    antwort: "Reklamation an CCDEU. Die Gutschrift kommt mit dem nächsten Abrechnungslauf.",
    stand: "2026-07-21",
    caseRef: "Invoice Correction",
  },
  {
    id: "re-doppelte-karten",
    kategorie: "Rechnungen",
    titel: "Karten doppelt berechnet",
    stichworte: ["doppelt", "karten berechnet", "cardfee"],
    antwort:
      "Case an Cards bzw. Reklamation. Kategorie: Complaint → Invoice → Fee → CardFee. Das ist kein Notfall.",
    stand: "2026-08-28",
  },
  {
    id: "re-2025",
    kategorie: "Rechnungen",
    titel: "Ladevorgänge aus 2025 auf aktueller Rechnung",
    stichworte: ["2025", "echarge", "alte transaktion", "nachberechnung"],
    antwort: "Wurden verspätet übermittelt und sind korrekt. Keine Cases anlegen.",
    stand: "2026-07-28",
  },
  {
    id: "re-blockier",
    kategorie: "Rechnungen",
    titel: "Unplausible Charge-&-Park- bzw. Blockiergebühren",
    stichworte: ["blockiergebühr", "parkgebühr", "charge & park", "stunden"],
    antwort: "Case an Digital (Plus).",
    stand: "2026-07-17",
  },
  {
    id: "re-xrechnung",
    kategorie: "Rechnungen",
    titel: "X-Rechnung, ZUGFeRD, Absender",
    stichworte: ["x-rechnung", "zugferd", "e-rechnung", "noreply"],
    antwort:
      "X-Rechnung schriftlich mit Formular beantragen (Case). ZUGFeRD kommt als PDF. Absender der Rechnungen: noreply.invoice@uta.com.",
    stand: "2026-10-14",
    caseRef: "X-Rechnung",
  },
  {
    id: "re-lieferschein",
    kategorie: "Rechnungen",
    titel: "Lieferschein ohne Preis",
    stichworte: ["lieferschein", "kassenzettel", "preis fehlt"],
    antwort: "An manchen Tankstellen normal. Maßgeblich ist die UTA-Abrechnung.",
    stand: "2026-09-24",
  },
  {
    id: "frei-panne",
    kategorie: "Freigaben & Pannen",
    titel: "Pannennotruf",
    stichworte: ["panne", "abschleppen", "adac", "notruf"],
    antwort:
      "24h-Pannennotruf 00800 88 27 37 84 (gebührenfrei). Abrechnung über UTA auch im Nachgang möglich; der Abschleppdienst meldet sich dafür bei UTA.",
    stand: "2026-07-01",
  },
  {
    id: "frei-reparatur",
    kategorie: "Freigaben & Pannen",
    titel: "Reparaturfreigabe",
    stichworte: ["freigabe", "reparatur", "werkstatt", "149", "autorisierung"],
    antwort:
      "Durchwahl 06027 509-149 (Cards Service). Sonst die -660, eine E-Mail an cards@uta.com (wird bevorzugt bearbeitet) oder ein Case an HQ Cards. CC kann keine Freigaben erteilen.",
    stand: "2026-08-10",
  },
  {
    id: "frei-manuell",
    kategorie: "Freigaben & Pannen",
    titel: "Tankstelle: manuelle Freigabe",
    stichworte: ["manuelle freigabe", "notfallplan", "guidelines"],
    antwort: "Prozess laut UTA_Card_Guidelines_DE.pdf; liegt allen Partnern vor.",
    stand: "2026-07-24",
  },
  {
    id: "wl-einkauf",
    kategorie: "Weiterleitung",
    titel: "Tankstelle, Werkstatt, Lieferant",
    stichworte: ["tankstelle", "werkstatt", "lieferant", "einkauf", "procurement", "200"],
    antwort:
      "einkauf@uta.com bzw. procurement@uta.com. Nummern, die mit 200… beginnen und länger als Kundennummern sind, gehören zu Lieferanten.",
    stand: "2026-10-09",
  },
  {
    id: "wl-sales",
    kategorie: "Weiterleitung",
    titel: "Allgemeine Kundenanfrage per E-Mail",
    stichworte: ["sales@uta.com", "allgemein", "mail"],
    antwort: "sales@uta.com, wird intern verteilt.",
    stand: "2026-07-28",
  },
  {
    id: "wl-emobility",
    kategorie: "Weiterleitung",
    titel: "Wallbox, Backend E-Mobilität",
    stichworte: ["wallbox", "e-mobility", "laden", "backend"],
    antwort: "e-mobility_backoffice@uta.com",
    stand: "2026-08-24",
  },
  {
    id: "wl-ausland",
    kategorie: "Weiterleitung",
    titel: "Kunden aus dem Ausland",
    stichworte: ["litauen", "estland", "österreich", "ausland"],
    antwort:
      "Litauen: vilnius@uta.lt. Estland und Österreich: eigener Betreuer bzw. Ländergesellschaft.",
    stand: "2026-09-09",
  },
  {
    id: "wl-betrug",
    kategorie: "Weiterleitung",
    titel: "Verdacht auf Betrug",
    stichworte: ["betrug", "fremd getankt", "prevention"],
    antwort: "Case an CC; der Fall geht an das Prevention-Team.",
    stand: "2026-09-29",
    caseRef: "Fraud",
  },
  {
    id: "wl-scam",
    kategorie: "Weiterleitung",
    titel: "Spam-Mails im Namen von UTA",
    stichworte: ["scam", "phishing", "fake mail", "zip"],
    antwort:
      "Wer nie Kunde war: löschen. Kunde: die E-Mail per Mail weiterleiten lassen. Häufen sich die Fälle, im Chat melden.",
    stand: "2026-10-09",
    caseRef: "Spammails",
  },
  {
    id: "wl-fremde-rechnungen",
    kategorie: "Weiterleitung",
    titel: "Rechnungen anderer Kunden erhalten",
    stichworte: ["datenschutz", "fremde rechnung", "falsch zugestellt"],
    antwort:
      "Der Kunde schickt die falsch zugestellten Rechnungen per E-Mail, damit es geprüft werden kann.",
    stand: "2026-07-27",
  },
  {
    id: "kurz-chip",
    kategorie: "Kurzantworten",
    titel: "Karten mit Chip?",
    stichworte: ["chip", "magnetstreifen"],
    antwort: "Nicht geplant.",
    stand: "2026-07-28",
  },
  {
    id: "kurz-wasserstoff",
    kategorie: "Kurzantworten",
    titel: "Wasserstoff tanken?",
    stichworte: ["wasserstoff", "h2"],
    antwort: "Ja, geht.",
    stand: "2026-09-18",
  },
  {
    id: "kurz-payback",
    kategorie: "Kurzantworten",
    titel: "Payback- oder Shell-Punkte?",
    stichworte: ["payback", "punkte", "rabattpunkte"],
    antwort: "Nein, wird nicht angeboten.",
    stand: "2026-10-13",
  },
  {
    id: "kurz-ionity",
    kategorie: "Kurzantworten",
    titel: "Ionity-Abo",
    stichworte: ["ionity", "abo"],
    antwort: "Wird pro Karte gebucht, die Monatsgebühr gilt ebenfalls pro Karte.",
    stand: "2026-08-12",
  },
  {
    id: "kurz-mappen",
    kategorie: "Kurzantworten",
    titel: "Kartenmappen",
    stichworte: ["mappe", "kartenmappe"],
    antwort: "Werden nicht mehr produziert, ein Restbestand liegt in der Logistik.",
    stand: "2026-07-02",
    caseRef: "Card Holders",
  },
  {
    id: "kurz-smartcockpit",
    kategorie: "Kurzantworten",
    titel: "Smart Cockpit – Preise",
    stichworte: ["smart cockpit", "preis"],
    antwort: "Im FAQ im Kundenportal.",
    stand: "2026-09-11",
  },
];
