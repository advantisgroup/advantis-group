"use client";

import {
  Bold,
  CalendarPlus,
  Heading2,
  Info,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
  OctagonAlert,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Table2,
  TriangleAlert,
  Underline,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { matchesSearch } from "@/lib/format";
import { type CalloutVariant } from "@/lib/rich-callout";
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

/** A mentionable person — supplied by the consumer, e.g. from `api.people.users.options`. */
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

export interface LinkEditorState {
  /** The anchor being edited, or null when creating a new one. */
  element: HTMLAnchorElement | null;
  /** Where to insert — the popover takes focus, so the live selection is gone
   *  by the time the user hits apply. Same trick as `DateEditorState.range`. */
  range: Range | null;
  rect: DOMRect;
  text: string;
  url: string;
}

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

function closestCallout(root: HTMLElement, node: Node | null): HTMLElement | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;
  const callout = element?.closest<HTMLElement>("[data-callout]") ?? null;
  return callout && root.contains(callout) ? callout : null;
}

/** The direct child of `root` that contains `node` — the block a callout
 *  wraps. Null when the caret sits in loose text directly under the root. */
function topLevelBlock(root: HTMLElement, node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur.parentNode && cur.parentNode !== root) cur = cur.parentNode;
  return cur?.nodeType === 1 && cur.parentNode === root ? (cur as HTMLElement) : null;
}

function closestRichDate(root: HTMLElement, node: Node | null): HTMLElement | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;
  const date = element?.closest<HTMLElement>("[data-rich-date-start]") ?? null;
  return date && root.contains(date) ? date : null;
}

/**
 * The "/" menu. The toolbar is thirteen icons plus three pickers and already
 * wraps to two rows on a phone, so every format added to it costs more than it
 * gives — this scales instead, and keeps the freeflowing page free of chrome.
 *
 * `labelKey` resolves in the `RichText` namespace; `keywords` are matched
 * alongside the label so "bullet" finds the list and "warnung" the callout.
 */
export type SlashCommand = {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  keywords: string[];
} & (
  | { command: string; value?: string }
  | { action: "callout"; variant: CalloutVariant }
  | { action: "table" | "date" | "link" }
);

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    key: "heading",
    labelKey: "slashHeading",
    icon: Heading2,
    keywords: ["heading", "überschrift", "h2", "title"],
    command: "formatBlock",
    value: "h2",
  },
  {
    key: "bullets",
    labelKey: "slashBullets",
    icon: List,
    keywords: ["list", "liste", "bullet", "punkte"],
    command: "insertUnorderedList",
  },
  {
    key: "numbers",
    labelKey: "slashNumbers",
    icon: ListOrdered,
    keywords: ["numbered", "nummeriert", "ordered", "list"],
    command: "insertOrderedList",
  },
  {
    key: "quote",
    labelKey: "slashQuote",
    icon: Quote,
    keywords: ["quote", "zitat"],
    command: "formatBlock",
    value: "blockquote",
  },
  {
    key: "note",
    labelKey: "calloutInfo",
    icon: Info,
    keywords: ["note", "hinweis", "callout", "info"],
    action: "callout",
    variant: "info",
  },
  {
    key: "warning",
    labelKey: "calloutWarning",
    icon: TriangleAlert,
    keywords: ["warning", "achtung", "warnung", "callout"],
    action: "callout",
    variant: "warning",
  },
  {
    key: "danger",
    labelKey: "calloutDanger",
    icon: OctagonAlert,
    keywords: ["critical", "kritisch", "danger", "callout"],
    action: "callout",
    variant: "danger",
  },
  {
    key: "table",
    labelKey: "insertTable",
    icon: Table2,
    keywords: ["table", "tabelle"],
    action: "table",
  },
  {
    key: "date",
    labelKey: "insertDate",
    icon: CalendarPlus,
    keywords: ["date", "datum", "termin", "calendar"],
    action: "date",
  },
  {
    key: "link",
    labelKey: "insertLink",
    icon: Link2,
    keywords: ["link", "url"],
    action: "link",
  },
];

const INPUT_RULES: { marker: string; command: string; value?: string }[] = [
  { marker: "# ", command: "formatBlock", value: "h2" },
  { marker: "- ", command: "insertUnorderedList" },
  { marker: "* ", command: "insertUnorderedList" },
  { marker: "1. ", command: "insertOrderedList" },
  { marker: "> ", command: "formatBlock", value: "blockquote" },
];

/** Inline formatting wrappers a caret can end up "trapped" inside after a command runs. */
const INLINE_FORMAT_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "STRIKE", "S", "A", "KBD"]);
/** Commands whose result is an inline wrapper (as opposed to a block-level or stripping change). */
const INLINE_ESCAPE_COMMANDS = new Set(["bold", "italic", "underline", "strikeThrough"]);

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
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [slash, setSlash] = useState<{ query: string; rect: DOMRect } | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const savedRangeRef = useRef<Range | null>(null);
  // Separate from `active` (a flat Record<string, boolean>) because the
  // toolbar needs to know *which* variant the caret is in, not just whether
  // it's in one — clicking the same variant again removes the block.
  const [calloutVariant, setCalloutVariant] = useState<CalloutVariant | null>(null);

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
    const callout = closestCallout(el, sel.anchorNode);
    setCalloutVariant((callout?.getAttribute("data-callout") as CalloutVariant) ?? null);
  }, []);

  // Track selection changes globally; cheap because we early-out unless the
  // selection is inside this editor.
  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  /**
   * Markdown-ish shortcuts at the start of a block — "# ", "- ", "1. ", "> ".
   * Only at the very start, so "a - b" mid-sentence never turns into a list.
   * There's no "## " rule because "# " has already fired by then.
   */
  function applyInputRule(): boolean {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    // The caret can be in a completely different editable by the time this
    // runs — never rewrite a node that isn't ours.
    if (node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return false;

    const typed = (node.textContent ?? "").slice(0, range.startOffset);
    const rule = INPUT_RULES.find((r) => r.marker === typed);
    if (!rule) return false;
    const block = topLevelBlock(el, node) ?? el;
    if (!(block.textContent ?? "").startsWith(typed)) return false;

    (node as Text).deleteData(0, rule.marker.length);
    const caret = document.createRange();
    caret.setStart(node, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    exec(rule.command, rule.value);
    return true;
  }

  function emit() {
    const el = elRef.current;
    if (!el) return;
    el.setAttribute("data-empty", el.textContent ? "false" : "true");
    onChange(el.innerHTML);
    detectMention();
    detectSlash();
  }

  /** Same shape as `detectMention`: looks at the text right before the caret
   *  for an in-progress "/query". Requires a preceding space (or start of the
   *  block) so a URL or a date never opens the menu. */
  function detectSlash() {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      setSlash(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setSlash(null);
      return;
    }
    const before = (range.startContainer.textContent ?? "").slice(0, range.startOffset);
    const match = /(?:^|\s)\/([^\s/]{0,24})$/.exec(before);
    if (!match) {
      setSlash(null);
      return;
    }
    setSlashActiveIndex(0);
    setSlash({ query: match[1], rect: range.getBoundingClientRect() });
  }

  /** Removes the typed "/query" and applies the command in its place. */
  function runSlashCommand(command: SlashCommand) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent ?? "";
        const slashIndex = text.slice(0, range.startOffset).lastIndexOf("/");
        if (slashIndex !== -1) {
          (container as Text).deleteData(slashIndex, range.startOffset - slashIndex);
          const caret = document.createRange();
          caret.setStart(container, slashIndex);
          caret.collapse(true);
          sel.removeAllRanges();
          sel.addRange(caret);
        }
      }
    }
    setSlash(null);

    if ("command" in command) {
      exec(command.command, command.value);
      return;
    }
    switch (command.action) {
      case "callout":
        toggleCallout(command.variant);
        return;
      case "table":
        captureRange();
        insertTable(3, 3);
        return;
      case "date":
        openDateEditor();
        return;
      case "link":
        openLinkEditor();
    }
  }

  /** What the surface calls on `input`. Separate from `emit` because the input
   *  rules must only run for something the user just typed — `emit` also fires
   *  on blur and after programmatic edits, where rewriting the block under the
   *  caret would come out of nowhere. */
  function handleInput() {
    // A rule applies its command through `exec`, which emits on its own.
    if (applyInputRule()) return;
    emit();
  }

  /** The caret as it was before a popover took focus — the table and file-link
   *  pickers insert there instead of at the end of the document. */
  function captureRange() {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }

  /** Returns false when there's no usable saved caret, so the caller can fall
   *  back to appending rather than dropping what the user asked for. */
  function insertAtSavedRange(node: Node): boolean {
    const el = elRef.current;
    const range = savedRangeRef.current;
    if (!el || !range || !el.contains(range.commonAncestorContainer)) return false;
    range.deleteContents();
    range.insertNode(node);
    const after = document.createTextNode("​");
    node.parentNode?.insertBefore(after, node.nextSibling);
    const caret = document.createRange();
    caret.setStart(after, 1);
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
    savedRangeRef.current = null;
    emit();
    return true;
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
    return mentionCandidates
      .filter((c) => matchesSearch(mention.query, c.name, c.email))
      .slice(0, 6);
  }, [mention, mentionCandidates]);

  const slashMatches = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) => c.key.includes(q) || c.keywords.some((keyword) => keyword.includes(q)),
    );
  }, [slash]);

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

  /** Inserts a non-editable "linked file" chip at the caret the picker was
   *  opened from (see `captureRange`), falling back to the end of the content
   *  when there wasn't one. */
  function insertFileLink(name: string) {
    const span = document.createElement("span");
    span.className = "wiki-file-chip";
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-wiki-file-name", name);
    span.textContent = `\u{1F4CE} ${name}`;
    if (insertAtSavedRange(span)) return;
    onChange(`${value}${value && !/\s$/.test(value) ? " " : ""}${span.outerHTML} `);
  }

  /** A basic `rows` × `cols` table skeleton (first row as headers), inserted
   *  at the caret the picker was opened from. Row/column *editing* after that
   *  (add/remove) has no dedicated toolbar of its own yet; cell text itself is
   *  directly editable since the table lands in a real contentEditable. */
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
    if (insertAtSavedRange(table)) return;
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

  /** Same contract as `handleMentionKeyDown`. Only one of the two popups can
   *  be open at a time in practice — "@" and "/" can't both be the character
   *  right before the caret. */
  function handleSlashKeyDown(key: string): boolean {
    if (!slash || slashMatches.length === 0) return false;
    if (key === "ArrowDown") {
      setSlashActiveIndex((i) => (i + 1) % slashMatches.length);
      return true;
    }
    if (key === "ArrowUp") {
      setSlashActiveIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
      return true;
    }
    if (key === "Enter" || key === "Tab") {
      runSlashCommand(slashMatches[slashActiveIndex]);
      return true;
    }
    if (key === "Escape") {
      setSlash(null);
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

  function openLinkEditor() {
    const el = elRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return;
    }
    const range = sel.getRangeAt(0);
    const existing = closestAncestorTag(
      el,
      range.commonAncestorContainer,
      "A",
    ) as HTMLAnchorElement | null;
    setLinkEditor({
      element: existing,
      range: range.cloneRange(),
      rect: (existing ?? range).getBoundingClientRect(),
      text: existing?.textContent ?? range.toString(),
      url: existing?.getAttribute("href") ?? "",
    });
  }

  /** Builds the anchor by hand rather than via `execCommand("createLink")` —
   *  that command can only wrap a live selection, which the popover has
   *  already taken away, and it can't set the link's text. */
  function saveLinkEditor() {
    const el = elRef.current;
    if (!el || !linkEditor) return;
    const url = linkEditor.url.trim();
    if (!url) return;
    const text = linkEditor.text.trim() || url;

    if (linkEditor.element) {
      linkEditor.element.setAttribute("href", url);
      linkEditor.element.textContent = text;
    } else {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", url);
      anchor.textContent = text;
      const range = linkEditor.range;
      if (range && el.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(anchor);
      } else {
        el.appendChild(anchor);
      }
      const after = document.createTextNode("​");
      anchor.after(after);
      const caret = document.createRange();
      caret.setStart(after, 1);
      caret.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(caret);
    }
    setLinkEditor(null);
    emit();
    refreshActive();
  }

  function removeLink() {
    const anchor = linkEditor?.element;
    const parent = anchor?.parentNode;
    if (anchor && parent) {
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
      parent.removeChild(anchor);
    }
    setLinkEditor(null);
    emit();
    refreshActive();
  }

  /**
   * Wraps the block at the caret in a callout, swaps its variant, or — when
   * it's already this variant — unwraps it again. Same toggle-don't-nest rule
   * as `wrapSelectionInKbd`: clicking twice used to stack wrappers forever.
   */
  function toggleCallout(variant: CalloutVariant) {
    const el = elRef.current;
    el?.focus();
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    const existing = closestCallout(el, range.commonAncestorContainer);
    if (existing) {
      if (existing.getAttribute("data-callout") === variant) {
        const parent = existing.parentNode;
        while (existing.firstChild && parent) parent.insertBefore(existing.firstChild, existing);
        parent?.removeChild(existing);
      } else {
        existing.setAttribute("data-callout", variant);
      }
      emit();
      refreshActive();
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-callout", variant);
    const block = topLevelBlock(el, range.commonAncestorContainer);
    if (block) {
      block.parentNode?.insertBefore(wrapper, block);
      wrapper.appendChild(block);
    } else {
      // Loose text directly under the root (no paragraph yet) — give the
      // callout a paragraph of its own so Enter inside it behaves normally.
      const paragraph = document.createElement("p");
      paragraph.appendChild(range.extractContents());
      if (!paragraph.textContent) paragraph.appendChild(document.createElement("br"));
      wrapper.appendChild(paragraph);
      range.insertNode(wrapper);
      const caret = document.createRange();
      caret.selectNodeContents(paragraph);
      caret.collapse(false);
      sel.removeAllRanges();
      sel.addRange(caret);
    }
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
      openLinkEditor();
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
    handleInput,
    mention,
    mentionMatches,
    mentionActiveIndex,
    insertMention,
    handleMentionKeyDown,
    slash,
    slashMatches,
    slashActiveIndex,
    runSlashCommand,
    handleSlashKeyDown,
    setSlash,
    dateEditor,
    setDateEditor,
    openDateEditor,
    saveDateEditor,
    insertTable,
    insertDate,
    insertFileLink,
    captureRange,
    calloutVariant,
    toggleCallout,
    linkEditor,
    setLinkEditor,
    openLinkEditor,
    saveLinkEditor,
    removeLink,
  };
}

export type RichTextController = ReturnType<typeof useRichTextController>;
