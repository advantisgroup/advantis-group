"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { ACADEMY_ID } from "./use-academy-progress";

export function AskTrainer({
  chapterId,
  chapterTitle,
}: {
  chapterId: string;
  chapterTitle: string;
}) {
  const [text, setText] = useState("");
  const [justSent, setJustSent] = useState(false);
  const mine = useQuery(api.academyQuestions.listMine, { academyId: ACADEMY_ID });
  const ask = useMutation(api.academyQuestions.ask);

  const forChapter = (mine ?? []).filter(q => q.chapterId === chapterId);

  async function send() {
    if (!text.trim()) return;
    await ask({ academyId: ACADEMY_ID, chapterId, chapterTitle, text });
    setText("");
    setJustSent(true);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold">Frage an den Trainer</h3>
      <p className="mb-2 mt-1 text-sm text-muted-foreground">
        Etwas unklar in diesem Kapitel? Deine Frage wird gespeichert und im
        Trainer-Bereich beantwortet.
      </p>
      <Textarea
        value={text}
        onChange={e => {
          setText(e.target.value);
          setJustSent(false);
        }}
        placeholder="Deine Frage zu diesem Kapitel …"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={send}>Frage senden</Button>
        {justSent ? (
          <span className="text-xs text-muted-foreground">
            Gespeichert - der Trainer meldet sich.
          </span>
        ) : null}
      </div>

      {forChapter.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-sm font-semibold">Deine Fragen zu diesem Kapitel</p>
          {forChapter.map(q => (
            <div key={q._id} className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <b>{q.text}</b>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(q.createdAt).toLocaleDateString("de-DE")}
                </span>
              </div>
              {q.answered && q.answer ? (
                <p className="mt-2 rounded-md bg-success/10 p-2 text-xs">
                  <b>Antwort:</b> {q.answer}
                </p>
              ) : (
                <Badge variant="warning" className="mt-2">
                  Noch unbeantwortet
                </Badge>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
