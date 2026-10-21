// Meaning-oriented search for the Case & Support tool. Runs fully in the
// browser: German normalization + light stemming, a domain synonym table
// (agent wording ↔ UTA/Salesforce wording, incl. English case labels),
// compound-word matching, one-typo tolerance and IDF-weighted ranking.

import { type CaseRow, CASES } from "./case-search-data";
import { type SupportEntry, SUPPORT_ENTRIES } from "./support-data";

export type SearchDoc =
  | { kind: "support"; id: string; group: string; entry: SupportEntry }
  | { kind: "case"; id: string; group: string; row: CaseRow };

// ── text normalization ──────────────────────────────────────────────────────

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[´`'’]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines und oder aber auch " +
    "ich du er sie es wir ihr mein meine meinen mir mich dein sein seine ihre unser " +
    "ist sind war waren wird werden wurde wurden hat haben hatte habe kann koennen " +
    "kann will moechte soll muss darf mal noch schon nur sehr so wie was wer wo wann " +
    "warum wieso weshalb welche welcher welches ob dass weil wenn als bei mit von zu " +
    "zum zur im in an am auf aus fuer ueber unter nach vor bis um durch gegen ohne " +
    "nicht kein keine keinen man sich da hier dort jetzt immer bitte hallo kunde " +
    "kunden kundin the a an of to is and for my"
  ).split(" "),
);

const SUFFIXES = ["ungen", "ung", "ern", "en", "er", "es", "e", "s", "n"];

function stem(w: string): string {
  if (w.length <= 4 || /\d/.test(w)) return w;
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  }
  return w;
}

export function tokens(s: string): string[] {
  return fold(s)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem);
}

// ── synonyms: each group = words that mean the same thing for the hotline ─

const SYNONYM_GROUPS: string[] = [
  "limit vr verfuegungsrahmen rahmen kreditrahmen kreditlimit credit ausgabelimit",
  "erhoehen hochsetzen anheben mehr hoeher steigern increase change",
  "senken runtergesetzt gesenkt reduziert weg null",
  "karte tankkarte karten card cards",
  "abgelehnt geht funktioniert klappt declined fail fehler error abgewiesen",
  "gesperrt sperre sperren blockiert blocking block gesperrte",
  "entsperren freischalten unblock aktivieren",
  "pin geheimzahl code",
  "tanken getankt tankstelle tanke station gas",
  "rechnung rechnungen invoice faktura abrechnung",
  "kopie duplikat zweitschrift nochmal duplicate second reprint",
  "korrektur falsch fehlerhaft correction korrigieren",
  "bank bankverbindung iban konto kontonummer bankdaten bank details",
  "lastschrift abbuchung abgebucht einzug sepa debit mandat",
  "ruecklastschrift zurueckgegangen geplatzt rejected retoure ungedeckt",
  "ueberweisung ueberwiesen gezahlt bezahlt zahlung payment transfer",
  "prepaid vorkasse guthaben aufladen",
  "kaution sicherheit buergschaft security securities absicherung",
  "kuendigung gekuendigt kuendigen termination vertragsende beendet",
  "insolvenz pleite zahlungsunfaehig insolvent",
  "inkasso anwalt collection lawyer mahnung forderung",
  "portal login einloggen anmelden zugang passwort zugangsdaten account",
  "app handy smartphone anwendung",
  "betrug missbrauch fraud gestohlen geklaut fremd prevention",
  "spam phishing scam fake verdaechtig spammails",
  "mwst umsatzsteuer vat steuer ust erstattung tax",
  "xrechnung zugferd erechnung elektronisch invoicing",
  "firmenname umfirmierung rechtsform legal name",
  "stammtankstelle homebase",
  "panne liegengeblieben abschleppen pannenhilfe adac kaputt",
  "werkstatt reparatur workshop",
  "freigabe genehmigung autorisierung genehmigen",
  "wallbox laden ladestation emobility elektro strom echarge",
  "mappe kartenmappe huelle kartenhuelle holder",
  "datenschutz fremde falsch zugestellt",
  "stoerung ausfall systemausfall paytech",
  "gebuehr kosten gebuehren fee preis",
  "doppelt zweimal mehrfach",
  "neukunde neuer registrierung prospect onboarding",
  "bestellen bestellung order nachbestellen",
  "dauert lange wann warten pending",
  "angekommen eingegangen verbucht gutgeschrieben ankommen",
  "zurueck erstattung rueckzahlung erstatten zurueckzahlen",
  "reinkommen kommt einloggen login anmelden",
  "abgelehnt nicht zahlen bezahlen kasse",
];

const SYNONYMS = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const words = tokens(group);
  for (const w of words) {
    const set = SYNONYMS.get(w) ?? new Set<string>();
    for (const o of words) if (o !== w) set.add(o);
    SYNONYMS.set(w, set);
  }
}

// ── index ───────────────────────────────────────────────────────────────────

interface Field {
  tokens: string[];
  weight: number;
}

interface Indexed {
  doc: SearchDoc;
  fields: Field[];
  vocab: Set<string>;
  boost: number;
}

function caseTitle(r: CaseRow): string {
  return r.subcategoryDetail && r.subcategoryDetail !== "None"
    ? r.subcategoryDetail
    : r.subcategory || r.category;
}

export const CASE_GROUP = "Case-Zuordnung";

export const DOCS: SearchDoc[] = [
  ...SUPPORT_ENTRIES.map(
    (entry): SearchDoc => ({ kind: "support", id: entry.id, group: entry.kategorie, entry }),
  ),
  ...CASES.map((row, i): SearchDoc => ({ kind: "case", id: `case-${i}`, group: CASE_GROUP, row })),
];

export { caseTitle };

const INDEX: Indexed[] = DOCS.map((doc) => {
  const fields: Field[] =
    doc.kind === "support"
      ? [
          { tokens: tokens(doc.entry.titel), weight: 3 },
          { tokens: tokens(doc.entry.stichworte.join(" ")), weight: 3 },
          { tokens: tokens(doc.entry.fragen), weight: 2.5 },
          { tokens: tokens(doc.entry.kategorie), weight: 1.5 },
          { tokens: tokens(doc.entry.antwort), weight: 1 },
        ]
      : [
          { tokens: tokens(caseTitle(doc.row)), weight: 3 },
          { tokens: tokens(`${doc.row.subcategory} ${doc.row.category}`), weight: 2 },
          { tokens: tokens(doc.row.description), weight: 1.5 },
          { tokens: tokens(`${doc.row.recordType} ${doc.row.processor}`), weight: 0.8 },
        ];
  const vocab = new Set(fields.flatMap((f) => f.tokens));
  return { doc, fields, vocab, boost: doc.kind === "support" ? 1 : 0.75 };
});

const DF = new Map<string, number>();
for (const d of INDEX) for (const t of d.vocab) DF.set(t, (DF.get(t) ?? 0) + 1);

function idf(t: string): number {
  const df = DF.get(t) ?? 0;
  return Math.log(1 + INDEX.length / (1 + df));
}

function oneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** How well a single query term matches a single doc token (0..1). */
function termSim(q: string, d: string): number {
  if (q === d) return 1;
  if (q.length >= 4 && d.length >= 4 && (d.startsWith(q) || q.startsWith(d))) return 0.8;
  // compounds: "kartensperre" ⊃ "sperr", "bankverbindung" ⊃ "bank"
  // German compounds carry their meaning at the end: "rücklastschrift" is a
  // kind of "lastschrift", so a suffix hit counts almost like a full one.
  if (q.length >= 5 && d.endsWith(q)) return 0.85;
  if (q.length >= 4 && d.includes(q)) return 0.65;
  if (d.length >= 5 && q.includes(d)) return 0.55;
  if (oneTypo(q, d)) return 0.6;
  return 0;
}

function bestInDoc(term: string, d: Indexed): number {
  let best = 0;
  for (const f of d.fields) {
    for (const tok of f.tokens) {
      const s = termSim(term, tok) * f.weight;
      if (s > best) best = s;
    }
  }
  return best;
}

export interface Hit {
  doc: SearchDoc;
  score: number;
}

const SYN_KEYS = Array.from(SYNONYMS.keys());

interface QueryTerm {
  term: string;
  syns: string[];
  w: number;
  /** The word still being typed: matched as a prefix, never stemmed. */
  partial: boolean;
}

function prefixSim(q: string, d: string): number {
  return d.startsWith(q) ? 0.9 : q.length >= 4 && d.includes(q) ? 0.6 : 0;
}

function bestPrefixInDoc(term: string, d: Indexed): number {
  let best = 0;
  for (const f of d.fields) {
    for (const tok of f.tokens) {
      const s = prefixSim(term, tok) * f.weight;
      if (s > best) best = s;
    }
  }
  return best;
}

function termScore(t: QueryTerm, d: Indexed): number {
  let s = t.partial ? bestPrefixInDoc(t.term, d) : bestInDoc(t.term, d);
  // A word that is being typed may also be the start of a full word that
  // already scores higher on its own (e.g. "lastschr" → "lastschrift").
  if (t.partial) s = Math.max(s, bestInDoc(t.term, d) * 0.9);
  for (const syn of t.syns) {
    const ss = bestInDoc(syn, d) * 0.85;
    if (ss > s) s = ss;
  }
  return s;
}

function parseQuery(query: string): QueryTerm[] {
  const folded = fold(query);
  const typing = folded.length > 0 && !/\s$/.test(query);
  const words = folded.split(" ").filter(Boolean);
  const last = typing ? words.pop() : undefined;

  const terms: QueryTerm[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    const t = stem(w);
    if (seen.has(t)) continue;
    seen.add(t);
    terms.push({
      term: t,
      syns: Array.from(SYNONYMS.get(t) ?? []),
      w: Math.max(idf(t), 1),
      partial: false,
    });
  }
  const STOP_LIST = Array.from(STOPWORDS);
  if (
    last &&
    last.length >= 3 &&
    !STOPWORDS.has(last) &&
    !STOP_LIST.some((sw) => sw.startsWith(last))
  ) {
    const syns = new Set<string>();
    for (const key of SYN_KEYS) {
      if (key.startsWith(last)) {
        syns.add(key);
        for (const o of SYNONYMS.get(key) ?? []) syns.add(o);
      }
    }
    // Half a word says less than a whole one — it may not upset the ranking
    // the finished words already built.
    terms.push({
      term: last,
      syns: Array.from(syns),
      w: Math.max(idf(stem(last)), 1) * (terms.length ? 0.5 : 1),
      partial: true,
    });
  }
  return terms;
}

/** `null` = nothing searchable typed yet (only filler words): show the list. */
export function search(query: string, limit = 30): Hit[] | null {
  const all = parseQuery(query);
  if (all.length === 0) return null;

  // Words that match nothing anywhere (typos beyond repair, filler words,
  // a half-typed word) are ignored instead of pushing good entries out.
  const perDoc = INDEX.map((d) => all.map((t) => termScore(t, d)));
  const known = all.map((_, i) => perDoc.some((scores) => scores[i] > 0));
  const active = all.filter((_, i) => known[i]);
  if (active.length === 0) return all.every((t) => t.partial) ? null : [];

  const hits: Hit[] = [];
  INDEX.forEach((d, di) => {
    let score = 0;
    let matched = 0;
    all.forEach((t, ti) => {
      if (!known[ti]) return;
      const s = perDoc[di][ti];
      if (s > 0) matched++;
      score += s * t.w;
    });
    if (matched === 0) return;
    const coverage = matched / active.length;
    score *= d.boost * (0.5 + 0.5 * coverage);
    hits.push({ doc: d.doc, score });
  });

  hits.sort((a, b) => b.score - a.score);
  if (hits.length === 0) return hits;
  const top = hits[0].score;
  return hits.filter((h, i) => i < 8 || h.score >= top * 0.15).slice(0, limit);
}
