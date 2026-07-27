"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SCENARIOS } from "./data";
import { recordCallAttempt } from "./mutators";
import { DLAB } from "./progress";

import type { AcademyProgressData, DataKey, Scenario } from "./types";

interface SimState {
  scenarioId: string;
  step: number;
  score: number;
  data: DataKey[];
  picked: number | null;
}

interface LastResult {
  scenario: Scenario;
  score: number;
  max: number;
  data: DataKey[];
}

export function CallSimulator({
  progress,
  onMutate,
}: {
  progress: AcademyProgressData;
  onMutate: (fn: (p: AcademyProgressData) => AcademyProgressData) => void;
}) {
  const [sim, setSim] = useState<SimState | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const calls = progress.calls;

  function start(scenarioId: string) {
    setLastResult(null);
    setSim({ scenarioId, step: 0, score: 0, data: [], picked: null });
  }

  function pick(optionIndex: number) {
    if (!sim) return;
    const scenario = SCENARIOS.find(s => s.id === sim.scenarioId)!;
    const option = scenario.steps[sim.step].options[optionIndex];
    const nextData = [...sim.data];
    (option.dataKeys ?? []).forEach(key => {
      if (!nextData.includes(key)) nextData.push(key);
    });
    setSim({ ...sim, picked: optionIndex, score: sim.score + option.points, data: nextData });
  }

  function next() {
    if (!sim) return;
    const scenario = SCENARIOS.find(s => s.id === sim.scenarioId)!;
    if (sim.step < scenario.steps.length - 1) {
      setSim({ ...sim, step: sim.step + 1, picked: null });
      return;
    }
    const max = scenario.steps.length * 2;
    onMutate(p => recordCallAttempt(p, scenario, sim.score, sim.data));
    setLastResult({ scenario, score: sim.score, max, data: sim.data });
    setSim(null);
  }

  if (lastResult) {
    const pct = Math.round((lastResult.score / lastResult.max) * 100);
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-success/50 bg-success/10 p-5">
          <h3 className="font-semibold">
            Call abgeschlossen: {lastResult.scenario.title}
          </h3>
          <p className="my-2">
            <Badge variant={pct >= 70 ? "success" : "warning"}>
              {lastResult.score}/{lastResult.max} Punkte ({pct} %)
            </Badge>
          </p>
          <p className="mb-1 text-sm font-medium">Datenerfassung:</p>
          <ul className="mb-2 space-y-0.5 text-sm">
            {lastResult.scenario.targets.map(key => (
              <li key={key}>
                {lastResult.data.includes(key) ? "✓" : "✗ fehlt:"} {DLAB[key]}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            <b>Nächster Schritt im Prozess:</b> {lastResult.scenario.outcome}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setLastResult(null)}>
            Schließen
          </Button>
        </div>
        <ScenarioList calls={calls} onStart={start} />
      </div>
    );
  }

  if (!sim) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Du bist Telesales im Warm-Lead-Call. Ziel: ein qualifizierter Lead
          mit Wunsch nach Angebot oder Expertenberatung - oder ein sauber
          gepflegter Account mit Follow-up. Achte auf offene Fragen, die
          Quittungsmethode, Einwandbehandlung und vollständige
          Datenerfassung. Beste Antwort = 2 Punkte.
        </p>
        <ScenarioList calls={calls} onStart={start} />
      </div>
    );
  }

  const scenario = SCENARIOS.find(s => s.id === sim.scenarioId)!;
  const step = scenario.steps[sim.step];
  const bestIndex = step.options.reduce(
    (best, option, i) => (option.points > step.options[best].points ? i : best),
    0
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">{scenario.combo}</Badge>
        <span className="text-xs text-muted-foreground">
          Schritt {sim.step + 1}/{scenario.steps.length} · Punkte: {sim.score}
        </span>
      </div>
      <p className="my-2 text-xs text-muted-foreground">{scenario.persona}</p>
      <p className="mb-3 rounded-lg bg-muted p-3.5 text-sm">
        <b>Kunde:</b> „{step.customerSay}“
      </p>

      {sim.picked === null ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">Wie reagierst du?</p>
          <div className="space-y-1.5">
            {step.options.map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-ring/60 hover:bg-accent"
              >
                {option.text}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            {step.options.map((option, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  i === bestIndex && "border-success/60 bg-success/10",
                  i === sim.picked && i !== bestIndex && "border-destructive/60 bg-destructive/10",
                  i !== bestIndex && i !== sim.picked && "border-border"
                )}
              >
                {option.text}
                {i === bestIndex ? (
                  <Badge className="ml-2" variant="default">
                    {option.skill ?? "beste Reaktion"}
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
          <p className="my-3 text-sm">
            <b>
              +{step.options[sim.picked].points} Punkt
              {step.options[sim.picked].points === 1 ? "" : "e"}.
            </b>{" "}
            {step.options[sim.picked].feedback}
          </p>
          <Button onClick={next}>
            {sim.step < scenario.steps.length - 1 ? "Weiter im Gespräch" : "Call abschließen"}
          </Button>
        </>
      )}

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => setSim(null)}>
          Call abbrechen
        </Button>
      </div>
    </div>
  );
}

function ScenarioList({
  calls,
  onStart,
}: {
  calls: AcademyProgressData["calls"];
  onStart: (scenarioId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SCENARIOS.map(scenario => {
        const attempt = calls[scenario.id];
        return (
          <div key={scenario.id} className="rounded-xl border border-border bg-card p-4">
            <Badge variant="secondary">{scenario.combo}</Badge>
            <h3 className="mt-2 font-semibold">{scenario.title}</h3>
            <p className="text-xs text-muted-foreground">{scenario.persona}</p>
            {attempt ? (
              <p className="mt-2 text-xs">
                <Badge variant={attempt.score / attempt.max >= 0.7 ? "success" : "warning"}>
                  {attempt.score}/{attempt.max} Punkte
                </Badge>{" "}
                · Daten {attempt.data.length}/{scenario.targets.length} · Versuch{" "}
                {attempt.attempts ?? 1} · {attempt.date}
                {attempt.history?.length ? (
                  <span className="block text-muted-foreground">
                    frühere Versuche:{" "}
                    {attempt.history.map(h => `${h.score}/${h.max}`).join(", ")}
                  </span>
                ) : null}
              </p>
            ) : null}
            <Button size="sm" className="mt-2.5" onClick={() => onStart(scenario.id)}>
              {attempt ? "Erneut üben" : "Call starten"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
