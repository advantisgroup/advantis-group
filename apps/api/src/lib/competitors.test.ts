import { describe, expect, test } from "bun:test";

import {
  type Offer,
  aemModelToPageText,
  hasChanges,
  htmlToPageText,
  mergeWithPrevious,
  verifyOffers,
} from "./competitors.js";

const PAGE = `Aral Fuel &amp; Charge Tank- &amp; Ladekarte
<p>Mit Aral Fuel &amp; Charge haben Sie in Deutschland Zugriff auf 93 Prozent aller öffentlich zugänglichen Ladepunkte.</p>
<li>Zugang zu 93 Prozent aller öffentlich zugänglichen Ladestationen und 6.000 Tankstellen in Deutschland</li>
<script>var x = "Kartengebühr 0 €";</script>`;

const text = htmlToPageText(PAGE);

describe("htmlToPageText", () => {
  test("liefert sichtbaren Text ohne Skripte", () => {
    expect(text).toContain("Aral Fuel & Charge");
    expect(text).not.toContain("Kartengebühr");
  });
});

describe("aemModelToPageText", () => {
  test("liest Texte aus dem Seitenmodell", () => {
    const out = aemModelToPageText({
      ":items": {
        a: { title: "Shell Card", text: "<p>Rund 5.300 Akzeptanzstellen in Deutschland</p>" },
      },
    });
    expect(out).toContain("Shell Card");
    expect(out).toContain("Rund 5.300 Akzeptanzstellen in Deutschland");
  });
});

describe("verifyOffers", () => {
  const raw = [
    {
      anbieter: "Aral",
      produkt: "Aral Fuel & Charge",
      art: "Tank- und Ladekarte",
      merkmale: [
        {
          label: "Ladepunkte Deutschland",
          wert: "93 % der öffentlichen Ladepunkte",
          beleg: "Zugriff auf 93 Prozent aller öffentlich zugänglichen Ladepunkte",
        },
        // Zahl nicht im Beleg → raus
        {
          label: "Tankstellen Deutschland",
          wert: "7.000",
          beleg: "93 Prozent aller öffentlich zugänglichen Ladestationen und 6.000 Tankstellen",
        },
        // Zitat steht nicht auf der Seite → raus
        {
          label: "Kosten / Gebühren",
          wert: "2,00 € pro Monat",
          beleg: "Kartengebühr 2,00 € pro Monat je Karte",
        },
        // Merkmal nicht aus der Liste → raus
        {
          label: "Preis",
          wert: "6.000",
          beleg: "Ladestationen und 6.000 Tankstellen in Deutschland",
        },
      ],
    },
    // Anbieter nicht erlaubt → raus
    {
      anbieter: "Esso",
      produkt: "Aral Fuel & Charge",
      art: "Tankkarte",
      merkmale: [
        { label: "Besonderheit", wert: "x", beleg: "Zugriff auf 93 Prozent aller öffentlich" },
      ],
    },
  ];

  test("behält nur Belegtes", () => {
    const offers = verifyOffers(raw, text, ["Aral"]);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.merkmale.map((m) => m.label)).toEqual(["Ladepunkte Deutschland"]);
  });

  test("Angebote ohne belegtes Merkmal fallen weg", () => {
    expect(verifyOffers([{ ...raw[0], merkmale: [] }], text, ["Aral"])).toHaveLength(0);
    expect(verifyOffers("kaputt", text, ["Aral"])).toHaveLength(0);
  });
});

describe("mergeWithPrevious", () => {
  const offer = (wert: string, beleg: string): Offer => ({
    anbieter: "DKV",
    produkt: "DKV Card +Charge",
    art: "Tank- und Ladekarte",
    merkmale: [{ label: "Ladepunkte Europa", wert, beleg }],
  });
  const oldText = "DKV Card +Charge Laden an rund 1 Million Ladepunkten in Europa.";
  const newText = "DKV Card +Charge Laden an rund 1,2 Millionen Ladepunkten in Europa.";

  test("erster Lauf meldet keine Änderungen", () => {
    const { changes } = mergeWithPrevious(null, [], oldText, [
      offer("1 Mio.", "rund 1 Million Ladepunkten"),
    ]);
    expect(hasChanges(changes)).toBe(false);
  });

  test("geänderter Beleg = Änderung", () => {
    const { offers, changes } = mergeWithPrevious(
      oldText,
      [offer("1 Mio.", "rund 1 Million Ladepunkten")],
      newText,
      [offer("1,2 Mio.", "rund 1,2 Millionen Ladepunkten")],
    );
    expect(offers[0]!.merkmale.map((m) => m.wert)).toEqual(["1,2 Mio."]);
    expect(changes.neu.map((c) => c.wert)).toEqual(["1,2 Mio."]);
    expect(changes.entfallen.map((c) => c.wert)).toEqual(["1 Mio."]);
  });

  test("von der KI Ausgelassenes bleibt, solange der Beleg da ist", () => {
    const text2 = `${oldText} Neu: Plug & Charge.`;
    const { offers, changes } = mergeWithPrevious(
      oldText,
      [offer("1 Mio.", "rund 1 Million Ladepunkten")],
      text2,
      [],
    );
    expect(offers).toHaveLength(1);
    expect(hasChanges(changes)).toBe(false);
  });

  test("anders formuliert, gleicher Beleg = keine Neuigkeit", () => {
    const { offers, changes } = mergeWithPrevious(
      oldText,
      [offer("1 Mio.", "rund 1 Million Ladepunkten")],
      `${oldText} `,
      [offer("rund 1 Million", "rund 1 Million Ladepunkten")],
    );
    expect(hasChanges(changes)).toBe(false);
    expect(offers[0]!.merkmale.map((m) => m.wert)).toEqual(["1 Mio."]);
  });

  test("Produkt verschwindet von der Seite", () => {
    const { offers, changes } = mergeWithPrevious(
      oldText,
      [offer("1 Mio.", "rund 1 Million Ladepunkten")],
      "Ganz andere Seite ohne das Produkt.",
      [],
    );
    expect(offers).toHaveLength(0);
    expect(changes.entfalleneProdukte.map((p) => p.produkt)).toEqual(["DKV Card +Charge"]);
  });
});
