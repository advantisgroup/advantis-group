"use client";

import {
  Bold,
  CalendarPlus,
  Heading2,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

/** State and commands behind the rich text editor — the toolbar and surface both drive one of these. */

/** A mentionable person — supplied by the consumer, e.g. from `api.people.users.list`. */
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

export const TOOLS: (Cmd | "divider")[] = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: Strikethrough, label: "Strikethrough", command: "strikeThrough" },
  { icon: Keyboard, label: "Keyboard key", action: "kbd" },
  "divider",
  { icon: Heading2, label: "Heading", command: "formatBlock", value: "h2" },
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

export interface DateEditorState {
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

  /**
   * Appends a non-editable "linked file" chip to the end of the content
   * rather than inserting at the live caret — the picker that calls this
   * lives in a popover, and by the time a candidate is clicked the
   * contentEditable's selection may already be gone. Simpler and more
   * robust than trying to preserve an exact mid-text insertion point for
   * what's fundamentally a "reference this attachment" action.
   */
  function insertFileLink(name: string) {
    const span = document.createElement("span");
    span.className = "wiki-file-chip";
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-wiki-file-name", name);
    span.textContent = `\u{1F4CE} ${name}`;
    onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${span.outerHTML} `);
  }

  /** Appends a basic `rows` × `cols` table skeleton (first row as headers) to
   *  the end of the content — same append-only reasoning as `insertFileLink`
   *  above. Row/column *editing* after that (add/remove) has no dedicated
   *  toolbar of its own yet; cell text itself is directly editable since the
   *  table lands in a real contentEditable. */
  function insertTable(rows: number, cols: number) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const th = document.createElement("th");
      th.textContent = " ";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let r = 0; r < rows - 1; r++) {
      const row = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        td.textContent = " ";
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${table.outerHTML}<p><br></p>`);
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
    insertTable,
    insertDate,
    insertFileLink,
  };
}

export type RichTextController = ReturnType<typeof useRichTextController>;
