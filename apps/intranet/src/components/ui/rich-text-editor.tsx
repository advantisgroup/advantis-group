"use client";

import {
  Bold,
  CalendarPlus,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useIsMobile } from "@/hooks/use-mobile";
import { initials } from "@/lib/format";
import {
  formatRichDate,
  readRichDateElement,
  richDateInputFromTimestamp,
  richDateTimestampFromInput,
  syncSourcedRichDateHtml,
  type RichDateKind,
  type RichDateValue,
  writeRichDateElement,
} from "@/lib/rich-date";
import { cn } from "@/lib/utils";

/** A mentionable person — supplied by the consumer, e.g. from `api.users.list`. */
export interface MentionCandidate {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
}

type Cmd =
  | { icon: typeof Bold; label: string; command: string; value?: string }
  | { icon: typeof Link2; label: string; action: "link" }
  | { icon: typeof Keyboard; label: string; action: "kbd" }
  | { icon: typeof CalendarPlus; label: string; action: "date" };

const TOOLS: (Cmd | "divider")[] = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: Strikethrough, label: "Strikethrough", command: "strikeThrough" },
  { icon: Keyboard, label: "Keyboard key", action: "kbd" },
  "divider",
  { icon: List, label: "Bulleted list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
  {
    icon: Quote,
    label: "Quote",
    command: "formatBlock",
    value: "blockquote",
  },
  "divider",
  { icon: Link2, label: "Insert link", action: "link" },
  { icon: CalendarPlus, label: "Insert date", action: "date" },
  {
    icon: RemoveFormatting,
    label: "Clear formatting",
    command: "removeFormat",
  },
];

interface DateEditorState {
  id: string;
  element: HTMLElement | null;
  range: Range | null;
  label: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  kind: RichDateKind | "";
  description: string;
  location: string;
}

/** Walk up from `node` (staying inside `root`) looking for a matching tag. */
function closestAncestorTag(root: HTMLElement, node: Node | null, tag: string): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1 && (cur as HTMLElement).tagName === tag) return cur as HTMLElement;
    cur = cur.parentNode;
  }
  return null;
}

function isInsideTag(root: HTMLElement, node: Node | null, tag: string): boolean {
  return !!closestAncestorTag(root, node, tag);
}

function closestRichDate(root: HTMLElement, node: Node | null): HTMLElement | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;
  const date = element?.closest<HTMLElement>("[data-rich-date-start]") ?? null;
  return date && root.contains(date) ? date : null;
}

/** Inline formatting wrappers a caret can end up "trapped" inside after a command runs. */
const INLINE_FORMAT_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "STRIKE", "S", "A", "KBD"]);
/** Commands whose result is an inline wrapper (as opposed to a block-level or stripping change). */
const INLINE_ESCAPE_COMMANDS = new Set([
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "createLink",
]);

function isInlineFormatEl(node: Node | null): node is HTMLElement {
  return !!node && node.nodeType === 1 && INLINE_FORMAT_TAGS.has((node as HTMLElement).tagName);
}

/**
 * After applying inline formatting to a selection, drop an invisible,
 * unformatted anchor character right after the formatted run and park the
 * caret there. Without this, the caret is left sitting *inside* the
 * formatting element — a well-known contentEditable quirk — so both typing
 * and pressing the right arrow key stay trapped in the same style instead of
 * escaping it. A zero-width space (rather than a visible one) avoids
 * introducing a stray double space when the formatted text sits mid-sentence.
 */
function placeEscapeAnchor(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  let node: Node | null =
    range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentNode
      : range.endContainer;
  if (!isInlineFormatEl(node)) return;
  // Climb through nested wrappers (e.g. bold-and-italic) to the outermost one
  // so the anchor lands clear of all of them, not just the innermost.
  while (node && node !== el && isInlineFormatEl(node.parentNode)) {
    node = node.parentNode;
  }
  if (!node || !node.parentNode) return;
  const anchor = document.createTextNode("\u200B");
  node.parentNode.insertBefore(anchor, node.nextSibling);
  const newRange = document.createRange();
  newRange.setStart(anchor, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

/**
 * Shared state/behavior behind a rich-text editor: the contentEditable ref,
 * which toolbar styles are active at the caret, and the exec/run commands.
 * Split out from the bundled `RichTextEditor` so a caller that needs the
 * toolbar and the editable surface in different parts of its layout (e.g. a
 * toolbar docked above the mobile keyboard, far from the scrolling text) can
 * still share one editor instance.
 */
export function useRichTextController({
  value,
  onChange,
  mentionCandidates = [],
  onSourcedDateChange,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Enables "@name" autocomplete when non-empty; omit to leave mentions off. */
  mentionCandidates?: MentionCandidate[];
  onSourcedDateChange?: (source: string, value: RichDateValue) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // Which toolbar styles apply to the current selection/caret — drives the
  // active highlight so the user can see what's on without guessing.
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [mention, setMention] = useState<{ query: string; rect: DOMRect } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [dateEditor, setDateEditor] = useState<DateEditorState | null>(null);

  const syncValue = useCallback(() => {
    const el = elRef.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
      el.setAttribute("data-empty", el.textContent ? "false" : "true");
    }
  }, [value]);

  // A callback ref (rather than a plain useRef) so the DOM is kept in sync
  // both when `value` changes externally (e.g. reset) *and* whenever a fresh
  // surface attaches — React re-invokes a callback ref whenever its identity
  // changes (which happens every time `value`, and therefore `syncValue`,
  // changes) and also on every mount. Without this, a surface that gets
  // unmounted and remounted while `value` stays the same — e.g. the mobile
  // write/preview toggle — would attach to a brand new, empty
  // contentEditable and silently drop the existing body on the next keystroke.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      syncValue();
    },
    [syncValue],
  );

  const refreshActive = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const sel = window.getSelection();
    // Only reflect state when the caret/selection is actually inside the editor.
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const next: Record<string, boolean> = {};
    for (const tool of TOOLS) {
      if (tool === "divider" || !("command" in tool)) continue;
      if (tool.command === "formatBlock") {
        next[tool.label] = isInsideTag(el, sel.anchorNode, (tool.value ?? "").toUpperCase());
      } else if (tool.command === "removeFormat") {
        next[tool.label] = false;
      } else {
        try {
          next[tool.label] = document.queryCommandState(tool.command);
        } catch {
          next[tool.label] = false;
        }
      }
    }
    next["Insert link"] = isInsideTag(el, sel.anchorNode, "A");
    next["Keyboard key"] = isInsideTag(el, sel.anchorNode, "KBD");
    setActive(next);
  }, []);

  // Track selection changes globally; cheap because we early-out unless the
  // selection is inside this editor.
  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  function emit() {
    const el = elRef.current;
    if (!el) return;
    el.setAttribute("data-empty", el.textContent ? "false" : "true");
    onChange(el.innerHTML);
    detectMention();
  }

  /** Looks at the text right before the caret for an in-progress "@query" and
   *  opens/updates/closes the mention dropdown accordingly. No-ops entirely
   *  when the consumer didn't opt in via `mentionCandidates`. */
  function detectMention() {
    if (mentionCandidates.length === 0) return;
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      setMention(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setMention(null);
      return;
    }
    const before = (range.startContainer.textContent ?? "").slice(0, range.startOffset);
    const match = /(?:^|\s)@([^\s@]{0,32})$/.exec(before);
    if (!match) {
      setMention(null);
      return;
    }
    setMentionActiveIndex(0);
    setMention({ query: match[1], rect: range.getBoundingClientRect() });
  }

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.trim().toLowerCase();
    const pool = q
      ? mentionCandidates.filter((c) => c.name.toLowerCase().includes(q))
      : mentionCandidates;
    return pool.slice(0, 6);
  }, [mention, mentionCandidates]);

  /** Replaces the in-progress "@query" text with an atomic, non-editable
   *  mention chip plus a trailing space, and parks the caret right after it. */
  function insertMention(candidate: MentionCandidate) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return;
    const text = container.textContent ?? "";
    const before = text.slice(0, range.startOffset);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1) return;
    const parent = container.parentNode;
    if (!parent) return;

    const nodeBefore = document.createTextNode(text.slice(0, atIndex));
    const mentionSpan = document.createElement("span");
    mentionSpan.className = "mention";
    mentionSpan.setAttribute("contenteditable", "false");
    mentionSpan.setAttribute("data-mention-user-id", candidate.id);
    mentionSpan.textContent = `@${candidate.name}`;
    const spaceNode = document.createTextNode(" ");
    const nodeAfter = document.createTextNode(text.slice(range.startOffset));

    parent.insertBefore(nodeBefore, container);
    parent.insertBefore(mentionSpan, container);
    parent.insertBefore(spaceNode, container);
    parent.insertBefore(nodeAfter, container);
    parent.removeChild(container);

    const newRange = document.createRange();
    newRange.setStart(spaceNode, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMention(null);
    emit();
  }

  function insertDate(
    dateValue: RichDateValue,
    label?: string,
    source?: string,
    target?: HTMLElement | null,
  ) {
    const el = elRef.current;
    const text = label?.trim() || formatRichDate(dateValue, navigator.language);
    const sourcedTarget =
      target ??
      (source && el
        ? Array.from(el.querySelectorAll<HTMLElement>("[data-rich-date-source]")).find(
            (element) => element.getAttribute("data-rich-date-source") === source,
          )
        : null);
    const span = sourcedTarget ?? document.createElement("span");
    writeRichDateElement(span, dateValue, source);
    span.textContent = text;
    if (!el) {
      if (source) {
        const synced = syncSourcedRichDateHtml(value, source, dateValue, text);
        if (synced !== value) {
          onChange(synced);
          onSourcedDateChange?.(source, dateValue);
          return;
        }
      }
      onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${span.outerHTML} `);
      if (source) onSourcedDateChange?.(source, dateValue);
      return;
    }

    if (!sourcedTarget) {
      const savedRange = dateEditor?.range;
      const range =
        savedRange && el.contains(savedRange.commonAncestorContainer) ? savedRange : null;
      const space = document.createTextNode(" ");
      if (range) {
        range.deleteContents();
        range.insertNode(span);
        span.after(space);
      } else {
        if (el.textContent && !/\s$/.test(el.textContent)) el.append(" ");
        el.append(span, space);
      }
      const selection = window.getSelection();
      const nextRange = document.createRange();
      nextRange.setStart(space, 1);
      nextRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
    }
    emit();
    if (source) onSourcedDateChange?.(source, dateValue);
    refreshActive();
  }

  function openDateEditor(target?: HTMLElement | null) {
    const el = elRef.current;
    if (!el) return;
    const selection = window.getSelection();
    const currentRange =
      selection &&
      selection.rangeCount > 0 &&
      el.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    const existing =
      target ?? (currentRange ? closestRichDate(el, currentRange.commonAncestorContainer) : null);
    const value = existing ? readRichDateElement(existing) : null;
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    setDateEditor({
      id: value?.id ?? crypto.randomUUID(),
      element: existing,
      range: currentRange,
      label: existing?.textContent ?? currentRange?.toString() ?? "",
      startAt: value
        ? richDateInputFromTimestamp(value.startAt, value.allDay)
        : richDateInputFromTimestamp(nextHour.getTime(), false),
      endAt: value?.endAt ? richDateInputFromTimestamp(value.endAt, value.allDay) : "",
      allDay: value?.allDay ?? false,
      kind: value?.kind ?? "",
      description: value?.description ?? "",
      location: value?.location ?? "",
    });
  }

  function saveDateEditor() {
    if (!dateEditor?.startAt) return;
    const startAt = richDateTimestampFromInput(dateEditor.startAt, dateEditor.allDay);
    const endAt = dateEditor.endAt
      ? richDateTimestampFromInput(dateEditor.endAt, dateEditor.allDay)
      : undefined;
    if (
      !Number.isFinite(startAt) ||
      (endAt !== undefined &&
        (!Number.isFinite(endAt) || (dateEditor.allDay ? endAt < startAt : endAt <= startAt)))
    ) {
      return;
    }
    const value: RichDateValue = {
      id: dateEditor.id,
      startAt,
      ...(endAt ? { endAt } : {}),
      allDay: dateEditor.allDay,
      ...(dateEditor.kind ? { kind: dateEditor.kind } : {}),
      ...(dateEditor.description.trim() ? { description: dateEditor.description.trim() } : {}),
      ...(dateEditor.location.trim() ? { location: dateEditor.location.trim() } : {}),
    };
    insertDate(
      value,
      dateEditor.label,
      dateEditor.element?.getAttribute("data-rich-date-source") ?? undefined,
      dateEditor.element,
    );
    setDateEditor(null);
  }

  /** Returns true when it handled the keystroke (so the caller should
   *  preventDefault instead of letting it reach the contentEditable). */
  function handleMentionKeyDown(key: string): boolean {
    if (!mention || mentionMatches.length === 0) return false;
    if (key === "ArrowDown") {
      setMentionActiveIndex((i) => (i + 1) % mentionMatches.length);
      return true;
    }
    if (key === "ArrowUp") {
      setMentionActiveIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
      return true;
    }
    if (key === "Enter" || key === "Tab") {
      insertMention(mentionMatches[mentionActiveIndex]);
      return true;
    }
    if (key === "Escape") {
      setMention(null);
      return true;
    }
    return false;
  }

  function exec(command: string, val?: string) {
    const el = elRef.current;
    el?.focus();
    const sel = window.getSelection();
    const hadRange = !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
    document.execCommand(command, false, val);
    // Only park an escape anchor when a selection was actually (re)formatted —
    // not for a bare toggle-for-next-keystroke click on a collapsed caret,
    // which should keep behaving like every other editor's "type in bold now".
    if (hadRange && el && INLINE_ESCAPE_COMMANDS.has(command)) placeEscapeAnchor(el);
    emit();
    refreshActive();
  }

  /** `execCommand` has no "wrap selection in an arbitrary tag" primitive —
   *  Range.surroundContents does, but only when the selection doesn't
   *  straddle a partial element boundary (fine for a few words of plain text). */
  function wrapSelectionInKbd() {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    // Toggle off instead of nesting another <kbd> inside an existing one —
    // clicking the button again on already-kbd'd text used to stack an
    // unbounded number of wrappers around it.
    const existingKbd = closestAncestorTag(el, range.commonAncestorContainer, "KBD");
    if (existingKbd) {
      const parent = existingKbd.parentNode;
      if (parent) {
        while (existingKbd.firstChild) parent.insertBefore(existingKbd.firstChild, existingKbd);
        parent.removeChild(existingKbd);
      }
      sel.removeAllRanges();
    } else {
      try {
        const kbd = document.createElement("kbd");
        range.surroundContents(kbd);
        placeEscapeAnchor(el);
      } catch {
        // Selection spans multiple block elements — not a supported case here.
      }
    }
    emit();
    refreshActive();
  }

  function run(tool: Cmd) {
    if ("command" in tool) {
      exec(tool.command, tool.value);
      return;
    }
    if (tool.action === "link") {
      const url = window.prompt("Link URL", "https://");
      if (url && url !== "https://") exec("createLink", url);
    } else if (tool.action === "kbd") {
      elRef.current?.focus();
      wrapSelectionInKbd();
    } else if (tool.action === "date") {
      openDateEditor();
    }
  }

  return {
    ref,
    active,
    run,
    refreshActive,
    emit,
    mention,
    mentionMatches,
    mentionActiveIndex,
    insertMention,
    handleMentionKeyDown,
    dateEditor,
    setDateEditor,
    openDateEditor,
    saveDateEditor,
    insertDate,
  };
}

export type RichTextController = ReturnType<typeof useRichTextController>;

/** The formatting button row — placeable independently of the editable surface. */
export function RichTextToolbar({
  controller,
  className,
}: {
  controller: RichTextController;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {TOOLS.map((tool, i) =>
        tool === "divider" ? (
          <span key={`d${i}`} className="mx-1 h-5 w-px bg-border/70" aria-hidden />
        ) : (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
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
    </div>
  );
}

function RichDateEditor({ controller }: { controller: RichTextController }) {
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

/** The contentEditable surface — placeable independently of the toolbar. */
export function RichTextSurface({
  controller,
  placeholder,
  onFocus,
  onBlur,
  className,
}: {
  controller: RichTextController;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <>
      <div
        ref={controller.ref}
        data-rte
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={controller.emit}
        onFocus={onFocus}
        onBlur={() => {
          controller.emit();
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (controller.handleMentionKeyDown(e.key)) e.preventDefault();
        }}
        onKeyUp={controller.refreshActive}
        onMouseUp={controller.refreshActive}
        onClick={(event) => {
          const date = (event.target as HTMLElement).closest<HTMLElement>("[data-rich-date-start]");
          if (date) {
            event.preventDefault();
            controller.openDateEditor(date);
          }
        }}
        role="textbox"
        aria-multiline="true"
        className={cn("rich-text px-3.5 py-3 outline-none", className)}
      />
      {controller.mention && controller.mentionMatches.length > 0 && (
        <div
          role="listbox"
          className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border/70 bg-popover py-1 shadow-overlay"
          style={{ top: controller.mention.rect.bottom + 6, left: controller.mention.rect.left }}
        >
          {controller.mentionMatches.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === controller.mentionActiveIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                controller.insertMention(c);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                i === controller.mentionActiveIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <Avatar className="size-6 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.name} />}
                <AvatarFallback className="text-[10px]">
                  {initials(c.name, c.email ?? "")}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <RichDateEditor controller={controller} />
    </>
  );
}

export function RichTextEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
  minHeight,
  mentionCandidates,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Fires when the editor gains focus — e.g. to track "which field is active" for external assignment (see the applicant CV fallback form). */
  onFocus?: () => void;
  /** Fires after the editor's own blur handling (which already commits the value via onChange) — for callers that only want to persist on blur rather than on every keystroke. */
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** Overrides the default `min-h-[14rem]` — smaller editors (e.g. a single CV field) don't need that much room. */
  minHeight?: string;
  /** Enables "@name" autocomplete when provided. */
  mentionCandidates?: MentionCandidate[];
}) {
  const controller = useRichTextController({ value, onChange, mentionCandidates });
  const isMobile = useIsMobile();
  const keyboardInset = useKeyboardInset();
  const [focused, setFocused] = useState(false);
  // The inline toolbar scrolls away above the keyboard as soon as there's a
  // paragraph or two of text, so on mobile it moves to a bar sitting on top
  // of the keyboard instead. It stays rendered in place (just hidden) so the
  // box doesn't jump by a row's height when the keyboard opens.
  const docked = isMobile && focused && keyboardInset > 0;

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
          className,
        )}
      >
        <RichTextToolbar
          controller={controller}
          className={cn("border-b border-border/70 bg-muted/40 px-1.5 py-1", docked && "invisible")}
        />
        <RichTextSurface
          controller={controller}
          placeholder={placeholder}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          className={cn("max-h-[28rem] overflow-y-auto", minHeight ?? "min-h-[14rem]")}
        />
      </div>
      {docked &&
        createPortal(
          <div
            style={{ bottom: keyboardInset }}
            className="fixed inset-x-0 z-50 border-t border-border/70 bg-card px-2 py-1.5 shadow-[0_-4px_16px_-6px_rgb(0_0_0/0.25)]"
          >
            <RichTextToolbar controller={controller} className="justify-center" />
          </div>,
          document.body,
        )}
    </>
  );
}
