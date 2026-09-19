"use client";

import { useState } from "react";

import { FileText, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { AttachmentDropZone } from "@/components/attachments/AttachmentDropZone";
import { Demo } from "@/components/playground/Demo";
import { PhysicsList } from "@/components/playground/PhysicsList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DROP_PREVIEW } from "@/hooks/use-physics-drag";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

const TASKS = ["coffee", "inbox", "standup", "review", "ship", "celebrate"];

const COLUMNS = ["todo", "doing", "done"] as const;
type Column = (typeof COLUMNS)[number];

const START_CARDS: { id: string; column: Column }[] = [
  { id: "logo", column: "todo" },
  { id: "tickets", column: "todo" },
  { id: "onboarding", column: "doing" },
  { id: "backup", column: "done" },
];

export default function PlaygroundDragPage() {
  const t = useTranslations("Playground");
  const [tasks, setTasks] = useState(TASKS);
  const [wobbly, setWobbly] = useState(false);
  const [cards, setCards] = useState(START_CARDS);
  const [over, setOver] = useState<Column | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  return (
    <>
      <Demo
        title={t("drag.physics.title")}
        description={t("drag.physics.description")}
        source="hooks/use-physics-drag.ts · components/layout/SidebarSections.tsx"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="wobbly" checked={wobbly} onCheckedChange={setWobbly} />
              <Label htmlFor="wobbly" className="text-[13px] font-normal">
                {t("drag.physics.wobbly")}
              </Label>
            </div>
            <Button
              variant="ghost"
              size="xs"
              disabled={tasks.join() === TASKS.join()}
              onClick={() => setTasks(TASKS)}
            >
              <RotateCcw />
              {t("reset")}
            </Button>
          </div>
        }
      >
        <div className="max-w-sm">
          {/* Remounts on toggle: the hook reads its tilt settings once. */}
          <PhysicsList
            key={String(wobbly)}
            items={tasks}
            onChange={setTasks}
            label={(id) => t(`drag.physics.tasks.${id}`)}
            wobbly={wobbly}
          />
        </div>
        <p className="mt-4 text-[12.5px] text-muted-foreground">{t("drag.physics.hint")}</p>
      </Demo>

      <Demo
        title={t("drag.board.title")}
        description={t("drag.board.description")}
        source="components/applicants/ApplicantBoard.tsx"
        action={
          <Button
            variant="ghost"
            size="xs"
            disabled={cards === START_CARDS}
            onClick={() => setCards(START_CARDS)}
          >
            <RotateCcw />
            {t("reset")}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {COLUMNS.map((column) => {
            const inColumn = cards.filter((c) => c.column === column);
            return (
              <div
                key={column}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column);
                }}
                onDragLeave={() => setOver((current) => (current === column ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain");
                  setCards((current) => current.map((c) => (c.id === id ? { ...c, column } : c)));
                  setOver(null);
                }}
                className="flex min-h-40 flex-col gap-2 rounded-lg bg-muted/40 p-2.5"
              >
                <p className="flex items-center justify-between px-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`drag.board.columns.${column}`)}
                  <span className="tabular-nums">{inColumn.length}</span>
                </p>
                {inColumn.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}
                    className="cursor-grab rounded-md border border-border/70 bg-background px-3 py-2.5 text-sm active:cursor-grabbing"
                  >
                    {t(`drag.board.cards.${card.id}`)}
                  </div>
                ))}
                {over === column && <div className={cn("h-10 rounded-md", DROP_PREVIEW)} />}
              </div>
            );
          })}
        </div>
      </Demo>

      <Demo
        title={t("drag.files.title")}
        description={t("drag.files.description")}
        source="components/attachments/AttachmentDropZone.tsx"
      >
        <AttachmentDropZone
          hint={t("drag.files.hint")}
          onFiles={(dropped) => setFiles((current) => [...dropped, ...current].slice(0, 6))}
        >
          <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-border p-6 text-center">
            {files.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("drag.files.empty")}</p>
            ) : (
              <ul className="w-full max-w-sm space-y-1.5 text-left">
                {files.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2 text-[13px]"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AttachmentDropZone>
      </Demo>
    </>
  );
}
