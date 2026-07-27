"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ACADEMY_ID } from "./use-academy-progress";

export function AskTrainer({
  participantId,
  chapterId,
  chapterTitle,
  focusQuestionId,
}: {
  participantId: Id<"academyParticipants">;
  chapterId: string;
  chapterTitle: string;
  focusQuestionId?: string | null;
}) {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [justSent, setJustSent] = useState(false);
  const mine = useQuery(api.academyQuestions.listMine, { participantId });
  const ask = useMutation(api.academyQuestions.ask);
  const listRef = useRef<HTMLDivElement>(null);

  const forChapter = (mine ?? []).filter(q => q.chapterId === chapterId);

  useEffect(() => {
    if (!focusQuestionId || !mine) return;
    const el = document.getElementById(`ask-q-${focusQuestionId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusQuestionId, mine]);

  async function send() {
    if (!text.trim()) return;
    await ask({
      academyId: ACADEMY_ID,
      participantId,
      chapterId,
      chapterTitle,
      text,
    });
    setText("");
    setJustSent(true);
  }

  function copyLink(questionId: string) {
    const url = `${window.location.origin}${pathname}?ch=${encodeURIComponent(chapterId)}&q=${encodeURIComponent(questionId)}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
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
        <div
          ref={listRef}
          className="mt-4 space-y-2 border-t border-border pt-3"
        >
          <p className="text-sm font-semibold">
            Deine Fragen zu diesem Kapitel
          </p>
          {forChapter.map(q => (
            <div
              key={q._id}
              id={`ask-q-${q._id}`}
              className={cn(
                "rounded-md bg-muted/40 p-3 text-sm transition-colors",
                focusQuestionId === q._id && "ring-2 ring-primary"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <b>{q.text}</b>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {new Date(q.createdAt).toLocaleDateString("de-DE")}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Link kopieren"
                    onClick={() => copyLink(q._id)}
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                </div>
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
