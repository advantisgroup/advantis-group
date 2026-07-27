"use client";

import { useEffect, useState } from "react";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { RESEARCH_TASKS } from "./data";
import { saveResearchAnswers } from "./mutators";

import type { AcademyProgressData } from "./types";

export function Research({
  progress,
  onMutate,
}: {
  progress: AcademyProgressData;
  onMutate: (fn: (p: AcademyProgressData) => AcademyProgressData) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    progress.research
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValues(progress.research);
    // Only re-sync from the server on first load — typing shouldn't be
    // clobbered by our own subsequent save round-trips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    onMutate(p => saveResearchAnswers(p, values));
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Diese Aufgaben löst du online. Öffne die Links, recherchiere und trage
        deine Antworten ein - der Trainer sieht sie im Trainer-Bereich.{" "}
        <b>Speichern nicht vergessen.</b>
      </p>

      {RESEARCH_TASKS.map(task => (
        <div key={task.id} className="rounded-lg border border-border p-4">
          <h3 className="font-semibold">{task.title}</h3>
          <p className="mb-2 mt-1 text-sm text-muted-foreground">
            {task.intro}
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {task.links.map(([label, url]) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-primary px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {label}
                <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
          <div className="space-y-3">
            {task.questions.map((question, i) => {
              const key = `${task.id}_${i}`;
              return (
                <div key={key}>
                  <label
                    htmlFor={key}
                    className="mb-1 block text-sm font-medium"
                  >
                    {i + 1}. {question}
                  </label>
                  <Textarea
                    id={key}
                    value={values[key] ?? ""}
                    onChange={e => {
                      setSaved(false);
                      setValues(v => ({ ...v, [key]: e.target.value }));
                    }}
                    placeholder="Deine Antwort …"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={save}>Antworten speichern</Button>
        {saved ? (
          <span className="text-xs text-muted-foreground">Gespeichert.</span>
        ) : null}
      </div>
    </div>
  );
}
