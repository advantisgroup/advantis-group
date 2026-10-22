"use client";

import { useState } from "react";

import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Choice = "delete_all" | "keep_name";

const CHOICES: { value: Choice; title: string; text: string }[] = [
  {
    value: "delete_all",
    title: "Alle Daten löschen",
    text: "Kunde ist informiert, dass es dann in Zukunft auch wieder zu einem Kontakt kommen kann.",
  },
  {
    value: "keep_name",
    title: "Kontaktnamen beibehalten, Rest löschen",
    text: "Damit ein Kontakt in Zukunft zu 100 % ausgeschlossen werden kann.",
  },
];

/**
 * Schnellleiste → „Kunde auf die Blacklist setzen“: füllt über apps/api
 * (POST /blacklist) das Black-List-Google-Formular von UTA aus.
 */
export function BlacklistForm() {
  const client = useIntranetApiClient();
  const [salesforceUrl, setSalesforceUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactName, setContactName] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = salesforceUrl.trim() && contactName.trim() && choice && !sending;

  function reset() {
    setSalesforceUrl("");
    setAccountId("");
    setContactName("");
    setChoice(null);
    setNote("");
    setError(null);
    setDone(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      await client.fetchJson("/blacklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          salesforceUrl: salesforceUrl.trim(),
          accountId: accountId.trim() || undefined,
          contactName: contactName.trim(),
          choice,
          note: note.trim() || undefined,
        }),
      });
      setDone(true);
    } catch (err) {
      const message =
        err instanceof ApiResponseError
          ? (err.serverMessage ?? err.code ?? "Unbekannter Fehler")
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      toast.error("Eintragen fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="text-sm font-medium">
          Eingetragen – UTA bekommt die Meldung über das Formular.
        </p>
        <Button variant="outline" onClick={reset}>
          Weiteren Kunden eintragen
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Hier Kunden/Interessenten eintragen, die nicht mehr von UTA kontaktiert werden möchten.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="bl-sf">Link zu Salesforce *</Label>
        <Input
          id="bl-sf"
          type="url"
          required
          maxLength={1000}
          placeholder="https://…lightning.force.com/…"
          value={salesforceUrl}
          onChange={(e) => setSalesforceUrl(e.target.value)}
        />
        {salesforceUrl.trim() && !/force\.com|salesforce\.com/i.test(salesforceUrl) && (
          <p className="text-xs text-muted-foreground">
            Sieht nicht nach einem Salesforce-Link aus – bitte prüfen.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bl-acc">Kunden-Account-Nr. oder CAM-ID</Label>
        <Input
          id="bl-acc"
          maxLength={50}
          placeholder="CAM 12345 oder KN 12345"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Wenn vorhanden – bitte mit Präfix angeben: „CAM 12345“ oder „KN 12345“.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bl-asp">Gesprochen mit (Name ASP) *</Label>
        <Input
          id="bl-asp"
          required
          maxLength={200}
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Kunde/Interessent möchte *</Label>
        <RadioGroup value={choice ?? ""} onValueChange={(v) => setChoice(v as Choice)}>
          {CHOICES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
                choice === option.value && "border-primary bg-primary/5",
              )}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{option.title}</span>
                <span className="text-xs text-muted-foreground">{option.text}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bl-note">Sonstige Info</Label>
        <Textarea
          id="bl-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!canSubmit}>
        {sending && <Loader2 className="size-4 animate-spin" />}
        Auf die Blacklist setzen
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Wird direkt an das Black-List-Formular von UTA gesendet.
      </p>
    </form>
  );
}
