"use client";

import { Info, OctagonAlert, Paperclip, Table2, TriangleAlert } from "lucide-react";
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        // The popover steals focus, so remember where the caret was before
        // it did — otherwise the table lands at the end of the document.
        if (next) controller.captureRange();
        setOpen(next);
      }}
    >
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

const CALLOUT_OPTIONS = [
  { variant: "info", icon: Info, labelKey: "calloutInfo", accent: "text-info" },
  { variant: "warning", icon: TriangleAlert, labelKey: "calloutWarning", accent: "text-warn" },
  { variant: "danger", icon: OctagonAlert, labelKey: "calloutDanger", accent: "text-destructive" },
] as const;

/** "Callout" toolbar button — a variant picker rather than a plain command,
 *  and the trigger reflects the block the caret is in so the same click that
 *  made it can take it away again. */
export function CalloutPicker({ controller }: { controller: RichTextController }) {
  const t = useTranslations("RichText");
  const [open, setOpen] = useState(false);
  const current = CALLOUT_OPTIONS.find((o) => o.variant === controller.calloutVariant);
  const TriggerIcon = current?.icon ?? TriangleAlert;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("callout")}
          aria-label={t("callout")}
          aria-pressed={!!current}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:size-[17px]",
            current
              ? "bg-signal/15 text-signal"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <TriggerIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{t("callout")}</p>
        {CALLOUT_OPTIONS.map((option) => (
          <button
            key={option.variant}
            type="button"
            onClick={() => {
              controller.toggleCallout(option.variant);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <option.icon className={cn("size-3.5 shrink-0", option.accent)} />
            <span className="min-w-0 flex-1 truncate">{t(option.labelKey)}</span>
            {controller.calloutVariant === option.variant && (
              <span className="shrink-0 text-xs text-muted-foreground">{t("calloutRemove")}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** `TOOLS` carries English labels for `execCommand` bookkeeping; the two that
 *  open their own editor get a translated one for the tooltip. */
function toolLabel(
  tool: Exclude<(typeof TOOLS)[number], "divider">,
  t: (key: string) => string,
): string {
  if (!("action" in tool)) return tool.label;
  if (tool.action === "date") return t("insertDate");
  if (tool.action === "link") return t("insertLink");
  return tool.label;
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
            title={toolLabel(tool, t)}
            aria-label={toolLabel(tool, t)}
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
      <CalloutPicker controller={controller} />
      <TablePicker controller={controller} />
      {fileLinkCandidates && fileLinkCandidates.length > 0 && (
        <FileLinkPicker
          candidates={fileLinkCandidates}
          onOpen={controller.captureRange}
          onPick={(name) => controller.insertFileLink(name)}
        />
      )}
    </div>
  );
}

/**
 * Link text + URL, floating at the selection — the same fixed-position
 * treatment the mention dropdown uses, rather than a dialog, because two
 * fields don't warrant taking over the screen. Replaces the `window.prompt`
 * this used to be.
 */
export function RichLinkEditor({ controller }: { controller: RichTextController }) {
  const t = useTranslations("RichText");
  const tc = useTranslations("Common");
  const state = controller.linkEditor;
  if (!state) return null;

  function update(patch: Partial<typeof state>) {
    controller.setLinkEditor((current) => (current ? { ...current, ...patch } : current));
  }

  return (
    <div
      role="dialog"
      aria-label={t("insertLink")}
      className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border/70 bg-popover p-3 shadow-overlay"
      style={{
        top: Math.min(state.rect.bottom + 8, window.innerHeight - 200),
        left: Math.min(state.rect.left, window.innerWidth - 336),
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") controller.setLinkEditor(null);
        if (event.key === "Enter") {
          event.preventDefault();
          controller.saveLinkEditor();
        }
      }}
    >
      <div className="space-y-2">
        <Input
          autoFocus
          value={state.url}
          onChange={(event) => update({ url: event.target.value })}
          placeholder="https://…"
          aria-label={t("linkUrl")}
          className="h-8 text-sm"
        />
        <Input
          value={state.text}
          onChange={(event) => update({ text: event.target.value })}
          placeholder={t("linkTextPlaceholder")}
          aria-label={t("linkText")}
          className="h-8 text-sm"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        {state.element && (
          <Button size="sm" variant="ghost" className="mr-auto" onClick={controller.removeLink}>
            {t("linkRemove")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => controller.setLinkEditor(null)}>
          {tc("cancel")}
        </Button>
        <Button size="sm" disabled={!state.url.trim()} onClick={controller.saveLinkEditor}>
          {t("linkApply")}
        </Button>
      </div>
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
  onOpen,
}: {
  candidates: FileLinkCandidate[];
  onPick: (name: string) => void;
  /** Called as the popover opens, so the caret can be remembered before focus
   *  moves into it (see `captureRange`). */
  onOpen: () => void;
}) {
  const t = useTranslations("RichText");
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen();
        setOpen(next);
      }}
    >
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
