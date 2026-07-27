"use client";

import {
  Bold,
  Italic,
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
  | { icon: typeof Link2; label: string; action: "link" };

const TOOLS: (Cmd | "divider")[] = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: Strikethrough, label: "Strikethrough", command: "strikeThrough" },
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
  const ref = useRef<HTMLDivElement>(null);
  // Which toolbar styles apply to the current selection/caret — drives the
  // active highlight so the user can see what's on without guessing.
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Keep the DOM in sync when the value is changed externally (e.g. reset).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
      el.setAttribute("data-empty", el.textContent ? "false" : "true");
    }
  }, [value]);

  const refreshActive = useCallback(() => {
    const el = ref.current;
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
    setActive(next);
  }, []);

  // Track selection changes globally; cheap because we early-out unless the
  // selection is inside this editor.
  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-empty", el.textContent ? "false" : "true");
    onChange(el.innerHTML);
  }

  function exec(command: string, val?: string) {
    ref.current?.focus();
    document.execCommand(command, false, val);
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
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-muted/40 px-1.5 py-1">
        {TOOLS.map((tool, i) =>
          tool === "divider" ? (
            <span key={`d${i}`} className="mx-1 h-5 w-px bg-border/70" aria-hidden />
          ) : (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={!!active[tool.label]}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(tool)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors [&_svg]:size-[17px]",
                active[tool.label]
                  ? "bg-signal/15 text-signal"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <tool.icon />
            </button>
          ),
        )}
      </div>
      <div
        ref={ref}
        data-rte
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onFocus={onFocus}
        onBlur={() => {
          emit();
          onBlur?.();
        }}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        role="textbox"
        aria-multiline="true"
        className={cn(
          "rich-text max-h-[28rem] overflow-y-auto px-3.5 py-3 outline-none",
          minHeight ?? "min-h-[14rem]",
        )}
      />
    </div>
  );
}
