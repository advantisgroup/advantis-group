"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { suggestFollowUp } from "@advantis/convex/performance/onboarding";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { TimeSelect, useStatusConfig, useStatusName } from "./shared";

type Channel = "phone" | "email" | "note";
const activeChildren = (n: Node): Node[] => (n.children ?? []).filter((c) => !c.archived);

type Node = {
  id: string;
  label: string;
  freetext?: boolean;
  archived?: boolean;
  kind?: string;
  children?: Node[];
};

/**
 * "Kontakt festhalten": how (phone / e-mail / just a note), the situation
 * with its reason ("Lage"), a note, and the next follow-up – already filled
 * in for two days from now on the next quarter hour (weekends → Monday),
 * created when saving unless unticked.
 */
export function ContactForm({
  caseId,
  closed,
}: {
  caseId: Id<"onboardingCases">;
  closed: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const config = useStatusConfig();
  const statusName = useStatusName();
  const setOutcome = useMutation(api.performance.onboarding.setOutcome);
  const addContact = useMutation(api.performance.onboarding.addContact);

  const fresh = () => suggestFollowUp(new Date(), "contact");
  const [channel, setChannel] = useState<Channel>("phone");
  const [path, setPath] = useState<string[]>([]);
  const [freetext, setFreetext] = useState("");
  const [note, setNote] = useState("");
  const [withFollowUp, setWithFollowUp] = useState(true);
  const [followUp, setFollowUp] = useState(fresh);
  const [busy, setBusy] = useState(false);

  // Picker levels: situations, then the children of each pick.
  const levels: Node[][] = [];
  const chosen: Node[] = [];
  let options = config.outcomes.filter((o) => !o.archived) as Node[];
  for (let i = 0; i <= path.length && options.length > 0; i++) {
    levels.push(options);
    const node = options.find((o) => o.id === path[i]);
    if (!node) break;
    chosen.push(node);
    options = activeChildren(node);
  }
  const last = chosen[chosen.length - 1];
  const complete = channel === "note" || (!!last && activeChildren(last).length === 0);
  const kind = chosen[0]?.kind ?? null;
  const needsFreetext = channel !== "note" && complete && !!last?.freetext;
  const cancel = kind === "cancel";

  const reset = () => {
    setPath([]);
    setFreetext("");
    setNote("");
    setWithFollowUp(true);
    setFollowUp(fresh());
  };

  const submit = async () => {
    if (!complete) return;
    if (needsFreetext && !freetext.trim()) {
      toast.error(t("situation.textRequired"));
      return;
    }
    if (channel === "note" && !note.trim()) {
      toast.error(t("case.noteRequired"));
      return;
    }
    const follow =
      withFollowUp && !cancel && followUp.date
        ? { nextFollowUp: followUp.date, nextFollowUpTime: followUp.time || null }
        : {};
    setBusy(true);
    try {
      if (channel === "note") {
        await addContact({ caseId, kind: "note", note: note.trim(), ...follow });
        toast.success(t("case.saved"));
      } else {
        const text = [freetext.trim(), note.trim()].filter(Boolean).join("\n") || undefined;
        const result = await setOutcome({ caseId, path, text, channel, ...follow });
        toast.success(
          result.status === "winback"
            ? t("situation.toWinback")
            : t("situation.saved", { status: statusName(result.status) }),
        );
      }
      reset();
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  if (closed) return null;

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("case.addTitle")}</h3>
        <div className="flex rounded-lg border border-border/70 bg-background p-0.5" role="tablist">
          {(["phone", "email", "note"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={channel === c}
              onClick={() => {
                setChannel(c);
                if (c === "note") setPath([]);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                channel === c ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {t(`situation.channel.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {channel !== "note" &&
        levels.map((level, i) => (
          <div key={i} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {i === 0
                ? t("situation.title")
                : i === 1
                  ? t("situation.reason")
                  : t("situation.detail")}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {level.map((o) => (
                <Button
                  key={o.id}
                  type="button"
                  size="sm"
                  variant={path[i] === o.id ? "default" : "outline"}
                  className={cn(
                    "h-8",
                    path[i] !== o.id &&
                      o.kind === "cancel" &&
                      "border-destructive/40 text-destructive",
                    path[i] !== o.id && o.kind === "reached" && "border-ok/40 text-ok",
                  )}
                  onClick={() => {
                    setPath([...path.slice(0, i), o.id]);
                    if (i === 0) setWithFollowUp(o.kind !== "reached");
                  }}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        ))}

      {needsFreetext && (
        <div className="space-y-1.5">
          <Label htmlFor="ob-situation-text">{t("situation.freetext")}</Label>
          <Input
            id="ob-situation-text"
            value={freetext}
            onChange={(e) => setFreetext(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ob-note">{t("case.note")}</Label>
        <Textarea
          id="ob-note"
          rows={2}
          value={note}
          placeholder={t("case.notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {cancel ? (
        <p className="text-xs text-destructive">{t("situation.willWinback")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withFollowUp} onCheckedChange={(v) => setWithFollowUp(v === true)} />
            {t("situation.withFollowUp")}
          </label>
          <Input
            type="date"
            className="h-8 w-[160px]"
            value={followUp.date}
            disabled={!withFollowUp}
            onChange={(e) => setFollowUp({ ...followUp, date: e.target.value })}
          />
          <TimeSelect
            className="h-8"
            value={followUp.time}
            disabled={!withFollowUp}
            onChange={(time) => setFollowUp({ ...followUp, time })}
          />
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {path.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPath([])}>
            {t("situation.clear")}
          </Button>
        )}
        <Button size="sm" disabled={!complete || busy} onClick={() => void submit()}>
          {t("case.save")}
        </Button>
      </div>
    </section>
  );
}
