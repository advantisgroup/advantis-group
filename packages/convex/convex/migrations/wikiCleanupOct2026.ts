/**
 * Wiki-Aufräumen 19.10.2026 (Vahan).
 *
 * 1. Archiviert neun veraltete Anleitungen: `validUntil` wird auf jetzt
 *    gesetzt, dadurch rutschen sie in die Archiv-Ansicht („abgelaufen“) des
 *    Wikis. Nichts wird gelöscht – zurückholen = Gültigkeit im Wiki
 *    verlängern.
 * 2. Legt die Anleitung „Zeiterfassung — so funktioniert's“ in der Kategorie
 *    „Zeit & Konto“ an.
 *
 * Nach dem Deploy einmal im Convex-Dashboard ausführen:
 * `internal.migrations.wikiCleanupOct2026.run({ ownerEmail: "hovhannisyan@advantisgroup.de" })`.
 * Wiederholbar: bereits archivierte oder vorhandene Einträge werden übersprungen.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const ARCHIVE_SLUGS = [
  "onedrive-schulung",
  "sicherheitsanmeldung",
  "passwoerter-browser",
  "profil-konto",
  "onboarding",
  "abwesenheiten-genehmigen",
  "ankuendigungen-termine",
  "uploads-genehmigen",
  "verwaltung-mitglieder",
] as const;

export const TIME_GUIDE_SLUG = "zeiterfassung";
const TIME_GUIDE_TITLE = "Zeiterfassung — so funktioniert's";
const TIME_CATEGORY = { name: "Zeit & Konto", color: "#C77E1A" };

export const TIME_GUIDE_HTML = [
  "<p>Alles zur Zeiterfassung im Intranet: stempeln, Zeiten korrigieren, Urlaub und Krankheit eintragen, Stundenkonto verstehen. Du findest sie links unter <strong>„Zeiterfassung“</strong> und oben rechts über die Stempeluhr.</p>",
  "<p>Die Zeiterfassung hat fünf Reiter: <strong>Stempeluhr · Meine Zeiten · Abwesenheiten · Kalender</strong> und – nur für die Verwaltung – <strong>Verwaltung</strong>.</p>",

  "<h2>Stempeln</h2>",
  "<ol><li>Unter <strong>Stempeluhr</strong> (oder oben rechts) auf <strong>Einstempeln</strong> klicken.</li><li>Im kleinen Fenster den Knopf <strong>ganz nach rechts schieben</strong>. Erst dann wird gebucht – so stempelt niemand aus Versehen.</li><li>Genauso für <strong>Pause</strong>, <strong>Weiterarbeiten</strong> und <strong>Ausstempeln</strong>.</li></ol>",
  "<p>Morgens beim ersten Öffnen des Intranets (7–18 Uhr) kommt ein Pop-up „Guten Morgen – stempel dich ein“, wenn du noch nicht eingestempelt bist. Mit <strong>„Später“</strong> verschwindet es für den Tag, z. B. wenn du dich nur krankmelden willst.</p>",
  '<div data-callout="info"><p>Stempelst du mit dem Handy, wird die Buchung mit „Handy“ markiert und die Verwaltung bekommt eine Benachrichtigung.</p></div>',

  "<h2>Ausstempeln vergessen? (18-Uhr-Regel)</h2>",
  "<p>Wer um <strong>18:00 Uhr</strong> noch eingestempelt ist, wird automatisch beendet: Das System trägt ab deinem Beginn deine Regelarbeitszeit ein und markiert den Tag mit <strong>„Automatisch beendet“</strong>. Du bekommst einen Hinweis – bitte prüfen und, wenn nötig, unter <strong>Meine Zeiten</strong> korrigieren.</p>",

  "<h2>Pausen</h2>",
  "<ul><li>Gestempelte Pausen gehen immer von der Arbeitszeit ab. Es wird <strong>nie automatisch</strong> eine Pause abgezogen.</li><li>Gesetz (§ 4 ArbZG): über 6 Std. Arbeit mindestens <strong>30 Min.</strong> Pause, über 9 Std. mindestens <strong>45 Min.</strong></li><li>Ab <strong>6:15 Std.</strong> Arbeit mit weniger als 30 Min. Pause (alle Pausen des Tages zusammengezählt) steht am Tag <strong>„Pause &lt; 30 Min.“</strong>, und beim Ausstempeln werden du und die Verwaltung benachrichtigt.</li><li>Weitere Hinweise: über 10 Std. Arbeit am Tag, weniger als 11 Std. Ruhezeit zwischen zwei Arbeitstagen.</li></ul>",

  "<h2>Meine Zeiten ansehen und korrigieren</h2>",
  "<p>Unter <strong>Meine Zeiten</strong> siehst du deine Buchungen als Liste pro <strong>Woche</strong> oder <strong>Monat</strong> – mit Ist, Soll und Differenz. Über <strong>CSV-Export</strong> kannst du sie herunterladen.</p>",
  "<ul><li><strong>Zeit nachtragen:</strong> Knopf „Zeit nachtragen“ (oder am Tag „Zeit für diesen Tag nachtragen“) → Datum, Arbeitszeit/Pause, Beginn, Ende, Grund → <strong>„Korrektur beantragen“</strong>.</li><li><strong>Eintrag ändern oder löschen:</strong> am Eintrag auf „Bearbeiten“ bzw. „Löschen“ – wird ebenfalls als Korrektur beantragt.</li><li><strong>Früher angefangen, aber zu spät eingestempelt?</strong> Am laufenden Eintrag „Beginn ändern“ – ein Admin gibt den früheren Beginn frei.</li><li>Korrekturen gelten erst, wenn die Verwaltung sie <strong>freigibt</strong>. Bis dahin steht „Wartet auf Freigabe“; du kannst sie zurückziehen.</li></ul>",
  '<div data-callout="warning"><p><strong>Monatsabschluss:</strong> Am <strong>15. des Folgemonats</strong> wird der Vormonat automatisch gesperrt. Danach lässt sich nichts mehr ändern, nur noch nach Entsperren durch die Verwaltung. Korrekturen also bitte rechtzeitig eintragen.</p></div>',

  "<h2>Stundenkonto</h2>",
  "<ul><li>Das Stundenkonto ist die Summe aus Ist minus Soll – <strong>Plus grün, Minus rot</strong>. Überstunden laufen auf, Minusstunden auch.</li><li>Dein Soll kommt aus deinem <strong>Arbeitszeitmodell</strong> (Stunden je Wochentag), das die Verwaltung pflegt.</li><li>Der heutige Tag zählt erst ab morgen ins Konto – morgens stehst du also nicht schon im Minus.</li><li>Auf der Stempeluhr zeigt <strong>„Stundenkonto ausgleichen“</strong>, um wie viel Uhr du heute gehen kannst, damit das Konto auf null steht.</li><li>Überstunden abbauen: als Abwesenheit <strong>„Überstundenabbau“</strong> beantragen (siehe unten).</li></ul>",

  "<h2>Urlaub und Abwesenheiten</h2>",
  "<p>Unter <strong>Abwesenheiten</strong> oben rechts:</p>",
  "<ul><li><strong>Abwesenheit beantragen:</strong> Art wählen (Urlaub, Überstundenabbau, Sonderurlaub, Sonstiges), Von/Bis, bei Bedarf „Erster Tag halb“ / „Letzter Tag halb“ → <strong>„Antrag stellen“</strong>. Gilt erst nach Freigabe durch die Chefs. Beim Urlaubsantrag siehst du, wer im Zeitraum sonst Urlaub hat.</li><li><strong>Krank melden:</strong> gilt <strong>sofort</strong>, die Verwaltung wird informiert. Gedacht zum Nachtragen der Krankheitstage nach der Rückkehr, damit keine Minusstunden entstehen – bitte vor dem Monatsabschluss am 15.</li><li>Offene Anträge kannst du <strong>zurückziehen</strong>.</li></ul>",
  "<p><strong>Urlaubsanspruch:</strong> 24 Tage im Jahr (wenn nicht anders vereinbart), halbe Tage möglich. Resturlaub aus dem Vorjahr <strong>verfällt am 31. März</strong>. Feiertage und freie Tage zählen nicht als Urlaub.</p>",

  "<h2>Feiertage</h2>",
  "<p>Es gelten die Feiertage in Bayern (Nürnberg). Firmenregel: <strong>24.12. und 31.12. sind halbe Tage</strong> – Urlaub an diesen Tagen kostet je einen halben Urlaubstag. Der 15.08. ist in Nürnberg ein normaler Arbeitstag.</p>",

  "<h2>Kalender</h2>",
  "<p>Der Reiter <strong>Kalender</strong> zeigt den Urlaub im Team. Krankmeldungen und andere Abwesenheiten von Kolleg:innen siehst du nicht. Im Personenverzeichnis steht „Im Büro“, wenn jemand gerade eingestempelt ist.</p>",

  "<h2>Sonderfälle</h2>",
  "<ul><li><strong>Feste Arbeitszeit:</strong> Bei manchen Personen trägt das System die Arbeitszeit an jedem Arbeitstag automatisch ein – sie müssen nicht stempeln.</li><li><strong>Ohne Zeiterfassung:</strong> Für einzelne Personen ist das Stempeln ausgeschaltet; Abwesenheiten tragen sie trotzdem ein.</li></ul>",

  "<h2>Für die Verwaltung</h2>",
  "<p>Unter <strong>Verwaltung</strong>: <strong>Mitarbeitende</strong> (Arbeitszeitmodell, Urlaubsanspruch, Anfangssaldo, Einstellungen je Person), <strong>Freigaben</strong> (Abwesenheitsanträge und Korrekturen freigeben oder mit Begründung ablehnen), <strong>Feiertage</strong>, <strong>Monatsabschluss</strong> (entsperren nur mit Grund, danach wieder abschließen) und <strong>Protokoll</strong> (jede Änderung mit vorher/nachher).</p>",

  "<h2>Hilfe</h2>",
  "<p>Etwas stimmt nicht oder du kommst nicht weiter? Melde dich bei Vahan oder lege ein IT-Ticket an.</p>",
].join("");

export const run = internalMutation({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", ownerEmail.trim().toLowerCase()))
      .first();
    if (!owner || owner.status !== "active") {
      throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
    }
    const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
    const now = Date.now();

    const archived: string[] = [];
    const skipped: string[] = [];
    for (const slug of ARCHIVE_SLUGS) {
      const entry = await ctx.db
        .query("wikiEntries")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!entry || entry.validUntil <= now) {
        skipped.push(slug);
        continue;
      }
      await ctx.db.patch(entry._id, { validUntil: now, pinned: false, updatedAt: now });
      archived.push(slug);
    }

    const existing = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", TIME_GUIDE_SLUG))
      .unique();
    let timeGuide: "created" | "exists" = "exists";
    if (!existing) {
      const categories = await ctx.db.query("wikiCategories").collect();
      let categoryId = categories.find((c) => c.name === TIME_CATEGORY.name)?._id;
      if (!categoryId) {
        categoryId = await ctx.db.insert("wikiCategories", {
          name: TIME_CATEGORY.name,
          color: TIME_CATEGORY.color,
          createdByUserId: owner._id,
          createdAt: now,
        });
      }
      await ctx.db.insert("wikiEntries", {
        slug: TIME_GUIDE_SLUG,
        categoryId,
        thema: TIME_GUIDE_TITLE,
        erklaerung: TIME_GUIDE_HTML,
        tags: ["Zeiterfassung", "Stempeln", "Urlaub", "Stundenkonto"],
        validFrom: now,
        validUntil: now + YEAR_MS,
        version: 1,
        pinned: false,
        authorUserId: owner._id,
        authorName: ownerName,
        ownerUserId: owner._id,
        createdAt: now,
        updatedAt: now,
      });
      timeGuide = "created";
    }

    return { archived, skipped, timeGuide };
  },
});
