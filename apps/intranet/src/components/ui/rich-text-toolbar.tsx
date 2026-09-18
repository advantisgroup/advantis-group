"use client";

import { Paperclip, Table2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { richDateTimestampFromInput, type RichDateKind } from "@/lib/rich-date";
import { cn } from "@/lib/utils";
import { type DateEditorState, type RichTextController, TOOLS } from "./rich-text-controller";

/** The rich text formatting toolbar, plus the table picker and date dialog it opens. */

export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLS = 10;

/** "Insert table" toolbar button — a rows/cols popover rather than a plain
 *  command, so it doesn't fit the flat `TOOLS` list above. Always shown
 *  (not gated behind a prop) since it's generically useful wherever rich
 *  text is edited, not just guidebooks — same reasoning as "insert date". */
export function TablePicker({ controller }: { controller: RichTextController }) {
  const t = useTranslations("RichText");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("insertTable")}
          aria-label={t("insertTable")}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[17px]"
        >
          <Table2 />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("insertTable")}</p>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="rt-table-rows" className="text-xs text-muted-foreground">
              {t("tableRows")}
            </Label>
            <Input
              id="rt-table-rows"
              type="number"
              min={1}
              max={MAX_TABLE_ROWS}
              value={rows}
              onChange={(e) =>
                setRows(Math.min(MAX_TABLE_ROWS, Math.max(1, Number(e.target.value) || 1)))
              }
              className="h-8"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="rt-table-cols" className="text-xs text-muted-foreground">
              {t("tableCols")}
            </Label>
            <Input
              id="rt-table-cols"
              type="number"
              min={1}
              max={MAX_TABLE_COLS}
              value={cols}
              onChange={(e) =>
                setCols(Math.min(MAX_TABLE_COLS, Math.max(1, Number(e.target.value) || 1)))
              }
              className="h-8"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3 w-full"
          onClick={() => {
            controller.insertTable(rows, cols);
            setOpen(false);
          }}
        >
          {t("insertTable")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The formatting button row — placeable independently of the editable surface. */
export function RichTextToolbar({
  controller,
  className,
  fileLinkCandidates,
}: {
  controller: RichTextController;
  className?: string;
  /** Enables an "insert file link" button, listed right after "insert
   *  table". Rendered *inside* this same flex-wrap row (not as an external
   *  sibling) so it wraps onto a second line along with everything else on
   *  a narrow screen instead of getting stranded — a `flex-wrap` container
   *  only reflows its own direct children, not a sibling element sitting
   *  outside it. */
  fileLinkCandidates?: FileLinkCandidate[];
}) {
  const t = useTranslations("RichText");
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {TOOLS.map((tool, i) =>
        tool === "divider" ? (
          <span key={`d${i}`} className="mx-1 h-5 w-px bg-border/70" aria-hidden />
        ) : (
          <button
            key={tool.label}
            type="button"
            title={"action" in tool && tool.action === "date" ? t("insertDate") : tool.label}
            aria-label={"action" in tool && tool.action === "date" ? t("insertDate") : tool.label}
            aria-pressed={!!controller.active[tool.label]}
            // Keep the caret (and the keyboard) where they are — a plain tap
            // would blur the surface and close the docked bar mid-format.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => controller.run(tool)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md transition-colors [&_svg]:size-[17px]",
              controller.active[tool.label]
                ? "bg-signal/15 text-signal"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <tool.icon />
          </button>
        ),
      )}
      <span className="mx-1 h-5 w-px bg-border/70" aria-hidden />
      <TablePicker controller={controller} />
      {fileLinkCandidates && fileLinkCandidates.length > 0 && (
        <FileLinkPicker
          candidates={fileLinkCandidates}
          onPick={(name) => controller.insertFileLink(name)}
        />
      )}
    </div>
  );
}

export function RichDateEditor({ controller }: { controller: RichTextController }) {
  const t = useTranslations("RichText");
  const isMobile = useIsMobile();
  const state = controller.dateEditor;
  if (!state) return null;
  const startTimestamp = state.startAt
    ? richDateTimestampFromInput(state.startAt, state.allDay)
    : Number.NaN;
  const endTimestamp = state.endAt
    ? richDateTimestampFromInput(state.endAt, state.allDay)
    : undefined;
  const invalidStart = !Number.isFinite(startTimestamp);
  const invalidEndTime = endTimestamp !== undefined && !Number.isFinite(endTimestamp);
  const invalidEndRange =
    endTimestamp !== undefined &&
    Number.isFinite(endTimestamp) &&
    Number.isFinite(startTimestamp) &&
    (state.allDay ? endTimestamp < startTimestamp : endTimestamp <= startTimestamp);
  const invalidEnd = invalidEndTime || invalidEndRange;

  function update(patch: Partial<DateEditorState>) {
    controller.setDateEditor((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleAllDay(allDay: boolean) {
    const current = controller.dateEditor;
    if (!current) return;
    update({
      allDay,
      startAt: allDay ? current.startAt.slice(0, 10) : `${current.startAt.slice(0, 10)}T09:00`,
      endAt: current.endAt
        ? allDay
          ? current.endAt.slice(0, 10)
          : `${current.endAt.slice(0, 10)}T10:00`
        : "",
    });
  }

  const fields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rich-date-label">{t("dateText")}</Label>
        <Input
          id="rich-date-label"
          value={state.label}
          onChange={(event) => update({ label: event.target.value })}
          placeholder={t("dateTextPlaceholder")}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={state.allDay}
          onCheckedChange={(checked) => toggleAllDay(checked === true)}
        />
        {t("allDay")}
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rich-date-start">{t("starts")}</Label>
          <Input
            id="rich-date-start"
            type={state.allDay ? "date" : "datetime-local"}
            value={state.startAt}
            onChange={(event) => update({ startAt: event.target.value })}
            aria-invalid={invalidStart}
          />
          {invalidStart && !state.allDay && (
            <p className="text-xs text-destructive">{t("invalidBerlinTime")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rich-date-end">{t("endsOptional")}</Label>
          <Input
            id="rich-date-end"
            type={state.allDay ? "date" : "datetime-local"}
            value={state.endAt}
            onChange={(event) => update({ endAt: event.target.value })}
            aria-invalid={invalidEnd}
          />
          {invalidEndTime && !state.allDay && (
            <p className="text-xs text-destructive">{t("invalidBerlinTime")}</p>
          )}
          {invalidEndRange && <p className="text-xs text-destructive">{t("endAfterStart")}</p>}
        </div>
      </div>
      {!state.allDay && <p className="text-xs text-muted-foreground">{t("berlinTimeZone")}</p>}
      <div className="space-y-1.5">
        <Label>{t("eventTypeOptional")}</Label>
        <Select
          value={state.kind || undefined}
          onValueChange={(kind) => update({ kind: kind as RichDateKind })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("selectEventType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">{t("kindEvent")}</SelectItem>
            <SelectItem value="deadline">{t("kindDeadline")}</SelectItem>
            <SelectItem value="reminder">{t("kindReminder")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rich-date-editor-description">{t("descriptionOptional")}</Label>
        <Textarea
          id="rich-date-editor-description"
          value={state.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rich-date-editor-location">{t("locationOptional")}</Label>
        <Input
          id="rich-date-editor-location"
          value={state.location}
          onChange={(event) => update({ location: event.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("missingPayloadHint")}</p>
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => controller.setDateEditor(null)}>
        {t("cancel")}
      </Button>
      <Button
        onClick={controller.saveDateEditor}
        disabled={!state.label.trim() || !state.startAt || invalidStart || invalidEnd}
      >
        {t("saveDate")}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <MobileDrawer
        open
        onOpenChange={(open) => !open && controller.setDateEditor(null)}
        ariaLabel={t("insertDate")}
        className="h-[88vh]"
      >
        <div className="border-b border-border/70 px-5 pb-4">
          <p className="font-display text-lg font-semibold">{t("insertDate")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("insertDateDescription")}</p>
        </div>
        <div className="flex-1 px-5 py-4">{fields}</div>
        <div className="flex shrink-0 gap-2 border-t border-border/70 px-5 py-4 [&>button]:flex-1">
          {actions}
        </div>
      </MobileDrawer>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && controller.setDateEditor(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("insertDate")}</DialogTitle>
          <DialogDescription>{t("insertDateDescription")}</DialogDescription>
        </DialogHeader>
        {fields}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A file the editor can insert as a linked, previewable inline chip. */
export interface FileLinkCandidate {
  name: string;
  kind?: "image" | "file";
}

/** Toolbar-adjacent "insert file link" button — only rendered when the
 *  caller passed at least one attachment to link. Kept out of `TOOLS`/
 *  `RichTextToolbar` since it's opt-in and needs its own picker UI rather
 *  than a plain command. */
export function FileLinkPicker({
  candidates,
  onPick,
}: {
  candidates: FileLinkCandidate[];
  onPick: (name: string) => void;
}) {
  const t = useTranslations("RichText");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("insertFileLink")}
          aria-label={t("insertFileLink")}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[17px]"
        >
          <Paperclip />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
          {t("insertFileLink")}
        </p>
        <div className="max-h-56 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                onPick(c.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
