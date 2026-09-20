"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { ChapterBodyEditor } from "./ChapterBodyEditor";
import { useAcademySession } from "./session";
import { useAcademyContent } from "./use-academy-content";
import { ACADEMY_ID } from "./use-academy-progress";

import type { Chapter, QuizQuestion } from "./types";

/**
 * Editing for the course content that used to be a constant in the bundle.
 * Only reachable once the one-time migration has run — before that there's
 * nothing in the database to edit and the file is still what renders.
 *
 * Chapter prose isn't editable here yet: the body is the old block model, and
 * it wants the rich-text editor rather than a textarea per block. Titles,
 * segments and the whole quiz are, which is what a wrong answer needs.
 */
export function ContentEditor() {
  const { chapters, segments, migrated, loading } = useAcademyContent();

  if (loading) return <p className="text-sm text-muted-foreground">Lade Inhalte …</p>;
  if (!migrated) {
    return (
      <p className="text-sm text-muted-foreground">
        Die Kursinhalte stehen noch im Code. Übernimm sie unter Einstellungen einmalig in die
        Datenbank, danach sind sie hier bearbeitbar.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {chapters.map((chapter, index) => (
        <ChapterEditor key={chapter.id} index={index} chapter={chapter} segments={segments} />
      ))}
    </div>
  );
}

function ChapterEditor({
  index,
  chapter,
  segments,
}: {
  index: number;
  chapter: Chapter;
  segments: Record<string, string>;
}) {
  const { academyPin } = useAcademySession();
  const handleError = useErrorHandler();
  const updateChapter = useMutation(api.academy.content.updateChapter);
  const reorder = useMutation(api.academy.content.reorderQuestions);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [segment, setSegment] = useState(chapter.segment);
  const [adding, setAdding] = useState(false);

  const dirty = title !== chapter.title || segment !== chapter.segment;
  const quiz = chapter.quiz ?? [];

  async function saveChapter() {
    try {
      await updateChapter({
        academyId: ACADEMY_ID,
        pin: academyPin,
        chapterId: chapter.id,
        title,
        segment,
      });
      toast.success("Kapitel gespeichert.");
    } catch (e) {
      handleError(e);
    }
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= quiz.length) return;
    const ids = quiz.map((q) => q.id!).filter(Boolean);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    try {
      await reorder({
        academyId: ACADEMY_ID,
        pin: academyPin,
        chapterId: chapter.id,
        questionIds: ids,
      });
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="text-sm font-medium">
          {index + 1}. {chapter.title}
        </span>
        <span className="text-xs text-muted-foreground">{segments[chapter.segment]}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {quiz.length} {quiz.length === 1 ? "Frage" : "Fragen"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4 pl-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`title-${chapter.id}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                Titel
              </label>
              <Input
                id={`title-${chapter.id}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Segment</label>
              <Select value={segment} onValueChange={(v) => setSegment(v as typeof segment)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(segments).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" disabled={!dirty || !title.trim()} onClick={() => void saveChapter()}>
              Speichern
            </Button>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Kapiteltext</p>
            <ChapterBodyEditor chapterId={chapter.id} body={chapter.body ?? []} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Wissens-Check</p>
            {quiz.map((question, qi) => (
              <QuestionEditor
                key={question.id ?? qi}
                chapterId={chapter.id}
                question={question}
                onMoveUp={qi > 0 ? () => void move(qi, qi - 1) : undefined}
                onMoveDown={qi < quiz.length - 1 ? () => void move(qi, qi + 1) : undefined}
              />
            ))}
            {adding ? (
              <QuestionEditor
                chapterId={chapter.id}
                question={{ question: "", options: ["", ""], correctIndex: 0 }}
                startOpen
                onDone={() => setAdding(false)}
              />
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" />
                Frage hinzufügen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({
  chapterId,
  question,
  startOpen,
  onDone,
  onMoveUp,
  onMoveDown,
}: {
  chapterId: string;
  question: QuizQuestion;
  startOpen?: boolean;
  onDone?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { academyPin } = useAcademySession();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const save = useMutation(api.academy.content.saveQuestion);
  const archive = useMutation(api.academy.content.archiveQuestion);

  const [open, setOpen] = useState(!!startOpen);
  const [text, setText] = useState(question.question);
  const [options, setOptions] = useState<string[]>(question.options);
  const [correctIndex, setCorrectIndex] = useState(question.correctIndex);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await save({
        academyId: ACADEMY_ID,
        pin: academyPin,
        chapterId,
        questionId: question.id,
        question: text,
        options,
        correctIndex,
      });
      toast.success("Frage gespeichert.");
      if (onDone) onDone();
      else setOpen(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!question.id) return;
    const ok = await confirm({
      title: "Frage zurückziehen?",
      description:
        "Die Frage wird Teilnehmern nicht mehr gestellt. Bereits gegebene Antworten bleiben erhalten, damit alte Ergebnisse lesbar bleiben.",
      confirmLabel: "Zurückziehen",
    });
    if (!ok) return;
    try {
      await archive({ academyId: ACADEMY_ID, pin: academyPin, questionId: question.id });
    } catch (e) {
      handleError(e);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-w-0 flex-1 truncate text-left text-sm"
        >
          {question.question}
        </button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Nach oben"
          disabled={!onMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Nach unten"
          disabled={!onMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zurückziehen"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void remove()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Frage"
        rows={2}
      />
      <div className="space-y-1.5">
        {options.map((option, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Als richtige Antwort markieren"
              onClick={() => setCorrectIndex(oi)}
              className={cn(
                "size-4 shrink-0 rounded-full border transition-colors",
                oi === correctIndex ? "border-success bg-success" : "border-border",
              )}
            />
            <Input
              value={option}
              placeholder={`Antwort ${oi + 1}`}
              onChange={(e) =>
                setOptions((prev) => prev.map((o, i) => (i === oi ? e.target.value : o)))
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Antwort entfernen"
              disabled={options.length <= 2}
              onClick={() => {
                setOptions((prev) => prev.filter((_, i) => i !== oi));
                setCorrectIndex((c) => (c >= oi && c > 0 ? c - 1 : c));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, ""])}>
          <Plus className="size-3.5" />
          Antwort
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Der grüne Punkt markiert die richtige Antwort.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setText(question.question);
            setOptions(question.options);
            setCorrectIndex(question.correctIndex);
            if (onDone) onDone();
            else setOpen(false);
          }}
        >
          Abbrechen
        </Button>
        <Button
          size="sm"
          disabled={busy || !text.trim() || options.filter((o) => o.trim()).length < 2}
          onClick={() => void submit()}
        >
          Speichern
        </Button>
      </div>
    </div>
  );
}
