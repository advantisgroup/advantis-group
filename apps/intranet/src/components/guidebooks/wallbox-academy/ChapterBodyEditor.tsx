"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { useAcademySession } from "./session";
import { ACADEMY_ID } from "./use-academy-progress";

import type { ChapterBlock } from "./types";

/**
 * Editing for a chapter's prose. The body is the block model the migration
 * carried over, and the blocks are edited as blocks — converting them to rich
 * text and back would quietly drop `objections` (a collapsible objection and
 * its answer) and `diagram`, neither of which has an HTML form the sanitizer
 * would keep.
 */
const BLOCK_LABELS: Record<ChapterBlock["type"], string> = {
  heading: "Zwischenüberschrift",
  paragraph: "Absatz",
  list: "Aufzählung",
  objections: "Einwände",
  diagram: "Prozessgrafik",
};

function emptyBlock(type: ChapterBlock["type"]): ChapterBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "" };
    case "list":
      return { type: "list", items: [""] };
    case "objections":
      return { type: "objections", items: [["", ""]] };
    case "diagram":
      return { type: "diagram" };
    default:
      return { type: "paragraph", text: "" };
  }
}

export function ChapterBodyEditor({
  chapterId,
  body,
}: {
  chapterId: string;
  body: ChapterBlock[];
}) {
  const { academyPin } = useAcademySession();
  const handleError = useErrorHandler();
  const save = useMutation(api.academy.content.updateChapterBody);
  const [blocks, setBlocks] = useState<ChapterBlock[]>(body);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(blocks) !== JSON.stringify(body);

  function update(index: number, next: ChapterBlock) {
    setBlocks((prev) => prev.map((block, i) => (i === index ? next : block)));
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      await save({
        academyId: ACADEMY_ID,
        pin: academyPin,
        chapterId,
        body: JSON.stringify(blocks),
      });
      toast.success("Kapiteltext gespeichert.");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="divide-y divide-border/50">
        {blocks.map((block, index) => (
          <div key={index} className="group flex items-start gap-3 py-2.5">
            <span className="w-28 shrink-0 pt-2 text-xs text-muted-foreground">
              {BLOCK_LABELS[block.type]}
            </span>
            <div className="min-w-0 flex-1">
              <BlockFields block={block} onChange={(next) => update(index, next)} />
            </div>
            <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Nach oben"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Nach unten"
                disabled={index === blocks.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ChevronDown className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Block entfernen"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="size-3.5" />
              Block hinzufügen
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(BLOCK_LABELS) as ChapterBlock["type"][]).map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => setBlocks((prev) => [...prev, emptyBlock(type)])}
              >
                {BLOCK_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <Button size="sm" disabled={!dirty || busy} onClick={() => void submit()}>
          Kapiteltext speichern
        </Button>
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: ChapterBlock;
  onChange: (next: ChapterBlock) => void;
}) {
  if (block.type === "diagram") {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Wird als feste Grafik gerendert — nichts zu bearbeiten.
      </p>
    );
  }

  if (block.type === "heading") {
    return (
      <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
    );
  }

  if (block.type === "paragraph") {
    return (
      <Textarea
        rows={3}
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
      />
    );
  }

  if (block.type === "list") {
    return (
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={`Punkt ${i + 1}`}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((v, j) => (j === i ? e.target.value : v)),
                })
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Punkt entfernen"
              disabled={block.items.length <= 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ ...block, items: [...block.items, ""] })}
        >
          <Plus className="size-3.5" />
          Punkt
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {block.items.map(([objection, response], i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/70 p-2.5">
          <Input
            value={objection}
            placeholder="Einwand des Kunden"
            onChange={(e) =>
              onChange({
                ...block,
                items: block.items.map((pair, j) =>
                  j === i ? [e.target.value, pair[1]] : pair,
                ) as typeof block.items,
              })
            }
          />
          <Textarea
            rows={2}
            value={response}
            placeholder="Antwort"
            onChange={(e) =>
              onChange({
                ...block,
                items: block.items.map((pair, j) =>
                  j === i ? [pair[0], e.target.value] : pair,
                ) as typeof block.items,
              })
            }
          />
          <div className="flex justify-end">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Einwand entfernen"
              disabled={block.items.length <= 1}
              onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange({ ...block, items: [...block.items, ["", ""]] })}
      >
        <Plus className="size-3.5" />
        Einwand
      </Button>
    </div>
  );
}
