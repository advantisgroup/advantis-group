# KI-Pflege (`/ki-pflege`) und Wissen des KI-Assistenten

Stand 12.11.2026.

## Was der Assistent weiß

`aiTraining.access.apiKnowledge` liefert jedem KI-Lauf das ganze aktuelle Wiki
(gültige `wikiEntries`, als Text) und die aktiven KI-Regeln
(`aiTrainingRules`). `apps/api/src/lib/knowledge.ts` macht daraus den Prompt:

- Wiki bis `FULL_WIKI_CHARS` (320.000 Zeichen): komplett in einen gecachten
  System-Block. Danach: Inhaltsverzeichnis aller Einträge (Schlüssel
  `wiki:<id>`) plus die 12 passendsten Einträge voll; den Rest liest das
  Modell mit `open`.
- Das frühere fest eingebaute UTA-/Durchwahl-Briefing ist jetzt die Regel
  „Grundwissen“ (`DEFAULT_BRIEFING` in `aiTraining/lib.ts`), bis jemand sie
  in der KI-Pflege speichert – dann gibt es eine Zeile mit `builtin: true`.
- Werkzeug `report_gap`: findet der Assistent keine Antwort, legt er die
  Frage ohne Namen als offene Frage an (`aiTrainingGaps`, Quelle
  „assistant“). Ein 👎 im Chat kann dasselbe (Quelle „feedback“).

## Wer darf

`users.aiTrainer` (von Admins in „Berechtigte“ gesetzt) oder Admin –
`Caller.isAiTrainer`. Managers nicht automatisch. Alle Berechtigten sehen
alles in der KI-Pflege (offene Fragen, alle Trainings-Chats mit Dateien,
Vorschläge, Verlauf). Run-Art `aiTraining` in `aiRuns.hasAreaAccess`.

## Ablauf

1. Offene Fragen (`aiTrainingGaps`) – vom Assistenten, aus 👎, von Hand oder
   aus „Wiki prüfen“ (`POST /ai-training/check`, sucht Widersprüche und
   Lücken im ganzen Wiki).
2. Trainieren (`aiTrainingSessions`/`aiTrainingMessages`,
   `POST /ai-training/sessions/:id/messages`): Text und Dateien (PDF, Bilder,
   Text/CSV/HTML; Word wird im Browser zu HTML). Dateien liegen unverschlüsselt
   im Convex-Storage, damit alle Berechtigten sie öffnen können.
3. Die KI macht Vorschläge (`aiTrainingProposals`: neuer/geänderter
   Wiki-Eintrag, neue/geänderte Regel). Nichts ändert sich, bis jemand aus der
   KI-Pflege prüft, ggf. anpasst und „Übernehmen“ drückt
   (`aiTraining.proposals.apply`). Übernehmen beantwortet die zugehörige
   offene Frage.
4. Alles landet im Verlauf (`aiTrainingLog`).

## Offen

- Kosten: das ganze Wiki geht bei jeder Frage mit (gecacht, ~10 % Preis).
  Wächst das Wiki über die Grenze, schaltet es automatisch aufs
  Inhaltsverzeichnis um.
- AV-Vertrag/DPA mit Anthropic weiterhin offen (Trainings-Dateien gehen an
  Anthropic).
