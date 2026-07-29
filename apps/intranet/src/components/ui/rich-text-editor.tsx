"use client";

import {
  Bold,
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
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Cmd =
  | { icon: typeof Bold; label: string; command: string; value?: string }
  | { icon: typeof Link2; label: string; action: "link" }
  | { icon: typeof Keyboard; label: string; action: "kbd" };

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
  {
    icon: RemoveFormatting,
    label: "Clear formatting",
    command: "removeFormat",
  },
];

/** Walk up from `node` (staying inside `root`) looking for a matching tag. */
function isInsideTag(root: HTMLElement, node: Node | null, tag: string) {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1 && (cur as HTMLElement).tagName === tag) return true;
    cur = cur.parentNode;
  }
  return false;
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
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // Which toolbar styles apply to the current selection/caret — drives the
  // active highlight so the user can see what's on without guessing.
  const [active, setActive] = useState<Record<string, boolean>>({});

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
  }

  function exec(command: string, val?: string) {
    elRef.current?.focus();
    document.execCommand(command, false, val);
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
    try {
      const kbd = document.createElement("kbd");
      range.surroundContents(kbd);
      sel.removeAllRanges();
    } catch {
      // Selection spans multiple block elements — not a supported case here.
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
    }
  }

  return { ref, active, run, refreshActive, emit };
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
      onKeyUp={controller.refreshActive}
      onMouseUp={controller.refreshActive}
      role="textbox"
      aria-multiline="true"
      className={cn("rich-text px-3.5 py-3 outline-none", className)}
    />
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
}) {
  const controller = useRichTextController({ value, onChange });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      <RichTextToolbar
        controller={controller}
        className="border-b border-border/70 bg-muted/40 px-1.5 py-1"
      />
      <RichTextSurface
        controller={controller}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn("max-h-[28rem] overflow-y-auto", minHeight ?? "min-h-[14rem]")}
      />
    </div>
  );
}
