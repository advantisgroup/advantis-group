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
import { useEffect, useRef } from "react";

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

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the DOM in sync when the value is changed externally (e.g. reset).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
      el.setAttribute("data-empty", el.textContent ? "false" : "true");
    }
  }, [value]);

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
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-muted/40 px-1.5 py-1">
        {TOOLS.map((tool, i) =>
          tool === "divider" ? (
            <span
              key={`d${i}`}
              className="mx-1 h-5 w-px bg-border/70"
              aria-hidden
            />
          ) : (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={e => e.preventDefault()}
              onClick={() => run(tool)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[17px]"
            >
              <tool.icon />
            </button>
          )
        )}
      </div>
      <div
        ref={ref}
        data-rte
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        role="textbox"
        aria-multiline="true"
        className="rich-text min-h-[8.5rem] max-h-80 overflow-y-auto px-3.5 py-3 outline-none"
      />
    </div>
  );
}
