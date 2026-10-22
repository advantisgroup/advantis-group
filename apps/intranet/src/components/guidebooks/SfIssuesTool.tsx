"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const PROJECTS = ["Hot-Inbound", "Inbound", "Cold-Outbound", "OST Websales", "Sonstiges"];

/** Wert (englisch, so steht er in der Tabelle) + deutsche Erklärung. */
const TOPICS: { value: string; hint: string }[] = [
  { value: "no Account number", hint: "Keine Account-Nummer" },
  { value: "no customer Number", hint: "Keine Kundennummer" },
  { value: "no CAM ID", hint: "Keine CAM-ID" },
  { value: "SEPA not possible", hint: "SEPA nicht möglich" },
  { value: "Credit Status", hint: "Bonitätsstatus" },
  { value: "Quote Problem", hint: "Problem mit dem Angebot" },
  { value: "Closing problem", hint: "Abschluss klappt nicht" },
  { value: "no subscription", hint: "Kein Abo/Vertrag" },
  { value: "TAX Number löschen", hint: "Steuernummer löschen" },
  { value: "other", hint: "Sonstiges" },
];

interface SfIssue {
  row: number;
  datum: string;
  project: string;
  camId: string;
  firma: string;
  topic: string;
  beschreibung: string;
  status: string;
  info: string;
  sfLink: string;
}

function errorText(err: unknown): string {
  if (err instanceof ApiResponseError) return err.serverMessage ?? err.code ?? "Unbekannter Fehler";
  return err instanceof Error ? err.message : String(err);
}

function isNotConfigured(err: unknown): boolean {
  return err instanceof ApiResponseError && err.code === "feature_disabled";
}

function StatusBadge({ status }: { status: string }) {
  const s = status.trim().toLowerCase();
  const style =
    s === "done"
      ? "bg-success/10 text-success"
      : s === "in progress"
        ? "bg-warning/10 text-warning"
        : "bg-destructive/10 text-destructive";
  const label = s === "done" ? "Erledigt" : s === "in progress" ? "In Bearbeitung" : "Offen";
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", style)}>
      {label}
    </span>
  );
}

/**
 * Wiki-Tool „Salesforce-Problem melden“: schreibt über apps/api (POST
 * /sf-issues) eine Zeile in die Meldungs-Tabelle und zeigt die eigenen
 * Meldungen mit Status (GET /sf-issues/mine).
 */
export function SfIssuesTool() {
  const client = useIntranetApiClient();
  const [project, setProject] = useState("");
  const [camId, setCamId] = useState("");
  const [firma, setFirma] = useState("");
  const [topic, setTopic] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [sfLink, setSfLink] = useState("");
  const [dringend, setDringend] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [items, setItems] = useState<SfIssue[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const loadMine = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await client.fetchJson<{ items: SfIssue[] }>("/sf-issues/mine");
      setItems(data.items);
      setNotConfigured(false);
    } catch (err) {
      if (isNotConfigured(err)) setNotConfigured(true);
      else setListError(errorText(err));
    } finally {
      setLoadingList(false);
    }
  }, [client]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const linkInvalid = sfLink.trim() !== "" && !/^https?:\/\//i.test(sfLink.trim());
  const canSubmit =
    project && firma.trim() && topic && beschreibung.trim() && !linkInvalid && !sending;

  function reset() {
    setProject("");
    setCamId("");
    setFirma("");
    setTopic("");
    setBeschreibung("");
    setSfLink("");
    setDringend(false);
    setError(null);
    setDone(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      await client.fetchJson("/sf-issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          camId: camId.trim() || undefined,
          firma: firma.trim(),
          topic,
          beschreibung: beschreibung.trim(),
          dringend,
          sfLink: sfLink.trim() || undefined,
        }),
      });
      setDone(true);
      void loadMine();
    } catch (err) {
      if (isNotConfigured(err)) setNotConfigured(true);
      setError(errorText(err));
      toast.error("Melden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  if (notConfigured) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="size-8" />
        Salesforce-Meldungen sind noch nicht eingerichtet. Bitte bei der IT melden.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-sm font-medium">Gemeldet – das Problem steht jetzt in der Liste.</p>
          <Button variant="outline" onClick={reset}>
            Weiteres Problem melden
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Probleme in Salesforce melden – den Stand siehst du unten unter „Meine Meldungen“.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="sf-project">Projekt *</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger id="sf-project" className="w-full">
                  <SelectValue placeholder="Projekt wählen" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-topic">Topic *</Label>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger id="sf-topic" className="w-full">
                  <SelectValue placeholder="Problem-Art wählen" />
                </SelectTrigger>
                <SelectContent>
                  {TOPICS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.value}
                      <span className="text-muted-foreground"> – {o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-cam">CAM-ID / Kundennummer</Label>
              <Input
                id="sf-cam"
                maxLength={60}
                placeholder="CAM ID 517324 oder KdNr: 641282"
                value={camId}
                onChange={(e) => setCamId(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sf-firma">Firma / Kunde *</Label>
              <Input
                id="sf-firma"
                required
                maxLength={200}
                value={firma}
                onChange={(e) => setFirma(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sf-text">Beschreibung *</Label>
            <Textarea
              id="sf-text"
              required
              rows={4}
              maxLength={2000}
              placeholder="Was ist passiert? Was hast du schon versucht?"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sf-link">Salesforce-Link</Label>
            <Input
              id="sf-link"
              type="url"
              maxLength={500}
              placeholder="https://…lightning.force.com/…"
              value={sfLink}
              onChange={(e) => setSfLink(e.target.value)}
            />
            {linkInvalid && (
              <p className="text-xs text-destructive">Bitte vollständig mit https:// einfügen.</p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={dringend} onCheckedChange={(v) => setDringend(v === true)} />
            Dringend
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!canSubmit}>
            {sending && <Loader2 className="size-4 animate-spin" />}
            Problem melden
          </Button>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Meine Meldungen</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadMine()}
            disabled={loadingList}
            aria-label="Aktualisieren"
          >
            <RefreshCw className={cn("size-4", loadingList && "animate-spin")} />
          </Button>
        </div>
        {loadingList && items === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lade Meldungen…
          </p>
        ) : listError ? (
          <p className="text-sm text-destructive">{listError}</p>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Du hast noch keine Probleme gemeldet.</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {items.map((item) => (
              <li key={item.row} className="flex flex-col gap-1 px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.firma || "–"}
                    <span className="font-normal text-muted-foreground"> · {item.topic}</span>
                  </span>
                  {item.info.toUpperCase().includes("DRINGEND") && (
                    <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-medium text-white">
                      Dringend
                    </span>
                  )}
                  <StatusBadge status={item.status} />
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.beschreibung}</p>
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{item.datum}</span>
                  {item.project && <span>· {item.project}</span>}
                  {item.camId && <span>· {item.camId}</span>}
                  {/^https?:\/\//i.test(item.sfLink) && (
                    <a
                      href={item.sfLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                    >
                      · Salesforce <ExternalLink className="size-3" />
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
