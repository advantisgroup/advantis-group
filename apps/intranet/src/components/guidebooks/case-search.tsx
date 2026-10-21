"use client";

import { type ReactNode, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import {
  ArrowRight,
  ChevronDown,
  List,
  Map,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { aiErrorKey } from "@/components/ai/AiRunCard";
import { AiReveal } from "@/components/ai/AiReveal";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiEnabled } from "@/components/ai/use-ai-enabled";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { type CaseRow, CASES } from "./case-search-data";
import { SOPPanel } from "./sop-panel";
import { StationsFinder } from "./stations-finder";
import { SUPPORT_ENTRIES } from "./support-data";
import { CASE_GROUP, caseTitle, DOCS, search, type SearchDoc } from "./support-search";

// Domain content of this tool is German (team working language).

type View = "list" | "sop" | "stations";

const EXAMPLES = [
  "Karte wird an der Tankstelle abgelehnt",
  "Kunde braucht mehr Limit",
  "Überweisung ist noch nicht da",
  "Lastschrift ist geplatzt",
  "Fahrer hat PIN vergessen",
];

function findCase(ref: string): CaseRow | undefined {
  const r = ref.toLowerCase();
  return CASES.find((c) =>
    [c.subcategoryDetail, c.subcategory, c.category].some((v) => v.toLowerCase().includes(r)),
  );
}

function CaseInfo({ row }: { row: CaseRow }) {
  const parts = [row.recordType, row.category, row.subcategory, row.subcategoryDetail].filter(
    (p) => p && p !== "None",
  );
  return (
    <div className="space-y-1 text-sm">
      <div className="font-medium">{parts.join(" › ")}</div>
      {row.processor && (
        <div className="text-muted-foreground">
          Queue: <span className="font-medium text-foreground">{row.processor}</span>
        </div>
      )}
      {row.description && (
        <p className="leading-relaxed text-muted-foreground">{row.description}</p>
      )}
    </div>
  );
}

function docTitle(doc: SearchDoc): string {
  return doc.kind === "support" ? doc.entry.titel : caseTitle(doc.row);
}

function EntryItem({
  doc,
  open,
  onToggle,
  onTag,
  showGroup,
}: {
  doc: SearchDoc;
  open: boolean;
  onToggle: () => void;
  onTag: (q: string) => void;
  showGroup?: boolean;
}) {
  const linkedCase =
    doc.kind === "support" && doc.entry.caseRef ? findCase(doc.entry.caseRef) : undefined;
  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          {showGroup && (
            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {doc.group}
              {doc.kind === "case" ? ` · ${doc.row.recordType}` : ""}
            </span>
          )}
          <span className="block text-sm font-medium leading-snug">{docTitle(doc)}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {doc.kind === "support" ? (
            <>
              <p className="text-sm leading-relaxed">{doc.entry.antwort}</p>
              {linkedCase && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <ArrowRight className="size-3.5" /> Case anlegen als
                  </div>
                  <CaseInfo row={linkedCase} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {doc.entry.stichworte.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onTag(k)}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    #{k}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Stand {doc.entry.stand}
                </span>
              </div>
            </>
          ) : (
            <CaseInfo row={doc.row} />
          )}
        </div>
      )}
    </div>
  );
}

/** The AI answer for the last question, grounded only in Case & Support
 * knowledge and matching wiki entries (apps/api /case-support/ask). */
function AiAnswer({ asked, sending }: { asked: string; sending: boolean }) {
  const t = useTranslations("Ai");
  const view = useAiRun({ subjectKey: "caseSupport" });
  const working = sending || view.state === "working";
  const failed =
    view.state === "error" || view.state === "interrupted" || view.state === "cancelled";
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" /> KI-Antwort aus Case &amp; Support und Wiki
      </div>
      <p className="mb-2 text-xs text-muted-foreground">„{asked}“</p>
      {working ? (
        view.text && !sending ? (
          <div className="text-sm leading-relaxed">
            <AiReveal text={view.text} />
          </div>
        ) : (
          <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
        )
      ) : failed ? (
        <p className="text-sm text-muted-foreground">
          {view.state === "error"
            ? t(aiErrorKey(view.run?.errorCode ?? null))
            : view.state === "cancelled"
              ? t("cancelledBody")
              : t("interruptedBody")}
        </p>
      ) : view.text ? (
        <div className="text-sm leading-relaxed">
          <AiMarkdown>{view.text}</AiMarkdown>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Die KI kann sich irren – im Zweifel den Eintrag unten prüfen.
      </p>
    </div>
  );
}

function CaseSupport() {
  const aiEnabled = useAiEnabled();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const [asked, setAsked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const q = query.trim();
  const hits = useMemo(() => (q.length >= 2 ? search(q, 25) : []), [q]);

  const groups = useMemo(() => {
    const g: { name: string; docs: SearchDoc[] }[] = [];
    for (const d of DOCS) {
      let bucket = g.find((x) => x.name === d.group);
      if (!bucket) {
        bucket = { name: d.group, docs: [] };
        g.push(bucket);
      }
      bucket.docs.push(d);
    }
    return g;
  }, []);

  async function ask(text: string) {
    const question = text.trim();
    if (!aiEnabled || question.length < 3 || sending) return;
    setSending(true);
    setAsked(question);
    try {
      await apiClient.fetchJson<{ runId: string }>("/case-support/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
    } catch (err) {
      setAsked(null);
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  const toggle = (id: string) => setOpenIds((p) => ({ ...p, [id]: !p[id] }));
  const runTag = (t: string) => {
    setQuery(t);
    setOpenIds({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* Search hero */}
      <div className="mx-auto max-w-2xl space-y-3 pt-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Case &amp; Support</h1>
        <p className="text-sm text-muted-foreground">
          Beschreib das Problem in deinen eigenen Worten
          {aiEnabled ? " – mit Enter antwortet die KI." : "."}
        </p>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenIds({});
              if (!e.target.value.trim()) setAsked(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask(query);
            }}
            placeholder="z. B. Kunde kann nicht tanken, Karte wird abgelehnt"
            className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-12 text-base shadow-sm outline-none transition focus:border-foreground/30 focus:ring-4 focus:ring-foreground/5"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAsked(null);
              }}
              aria-label="Suche leeren"
              className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {!q && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  void ask(ex);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {asked && aiEnabled && <AiAnswer asked={asked} sending={sending} />}

      {/* Results */}
      {q.length >= 2 ? (
        hits.length === 0 ? (
          <div className="mx-auto max-w-md space-y-3 py-10 text-center">
            <p className="text-sm font-medium">Nichts Passendes gefunden.</p>
            <p className="text-xs text-muted-foreground">
              Anders formulieren oder im Chat „Telefonie Support“ nachfragen.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2">
            <p className="text-xs text-muted-foreground">
              {hits.length} Treffer, die besten zuerst
            </p>
            {hits.map((h, i) => (
              <EntryItem
                key={h.doc.id}
                doc={h.doc}
                open={openIds[h.doc.id] ?? i < 3}
                onToggle={() => setOpenIds((p) => ({ ...p, [h.doc.id]: !(p[h.doc.id] ?? i < 3) }))}
                onTag={runTag}
                showGroup
              />
            ))}
          </div>
        )
      ) : (
        <div className="mx-auto max-w-3xl space-y-6">
          <p className="text-center text-xs text-muted-foreground">
            {SUPPORT_ENTRIES.length} Support-Themen · {CASES.length} Case-Kategorien
          </p>
          {groups.map((g) => {
            const isCase = g.name === CASE_GROUP;
            const expanded = !isCase || openGroups[g.name];
            return (
              <section key={g.name} className="space-y-2">
                <button
                  type="button"
                  onClick={() => setOpenGroups((p) => ({ ...p, [g.name]: !p[g.name] }))}
                  disabled={!isCase}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <h2 className="text-sm font-semibold">{g.name}</h2>
                  <span className="text-xs text-muted-foreground">{g.docs.length}</span>
                  {isCase && (
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  )}
                </button>
                {expanded &&
                  g.docs.map((d) => (
                    <EntryItem
                      key={d.id}
                      doc={d}
                      open={!!openIds[d.id]}
                      onToggle={() => toggle(d.id)}
                      onTag={runTag}
                      showGroup={isCase}
                    />
                  ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MORE: { id: View; label: string; icon: ReactNode }[] = [
  { id: "sop", label: "Szenarien", icon: <List className="size-4" /> },
  { id: "stations", label: "Stationsfinder", icon: <Map className="size-4" /> },
];

export function CaseSearchGuidebook() {
  const [view, setView] = useState<View>("list");
  const isAdmin = useIsAdmin();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {view !== "list" && (
          <button
            type="button"
            onClick={() => setView("list")}
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Search className="size-4" /> Zurück zur Suche
          </button>
        )}
        {MORE.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setView(m.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
              view === m.id && "bg-accent text-foreground",
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
        {isAdmin && (
          <Link
            href="/wiki-chat"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquare className="size-4" /> Wiki-Chat
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {view === "list" && <CaseSupport />}
        {view === "sop" && <SOPPanel />}
        {view === "stations" && <StationsFinder />}
      </div>
    </div>
  );
}
