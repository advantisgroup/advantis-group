"use client";

import { useState } from "react";

import { ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { SCRIPT_SECTIONS } from "./constants";

export function ScriptTab({ activePath }: { activePath: number }) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(SCRIPT_SECTIONS.map((s) => s.id)),
  );
  const activeSectionId =
    activePath === 1 ? "a" : activePath === 2 ? "b" : activePath === 3 ? "c" : null;

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Kopiert");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {SCRIPT_SECTIONS.map((section) => {
        const open = openSections.has(section.id);
        const isActivePath = section.id === activeSectionId;
        return (
          <div key={section.id} className="border-b border-border/60 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-medium hover:bg-accent/50"
            >
              <span className="flex items-center gap-2">
                {isActivePath && <span className="size-1.5 rounded-full bg-success" />}
                {section.title}
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open && (
              <div className="space-y-2 px-3 pb-3">
                {section.cards.map((card) => (
                  <div
                    key={card.label}
                    className={cn(
                      "group relative rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                      card.highlight && "border-foreground/25",
                    )}
                  >
                    <div className="mb-0.5 text-xs text-muted-foreground">{card.label}</div>
                    <div className="pr-6">{card.text}</div>
                    <button
                      type="button"
                      onClick={() => copy(card.text)}
                      aria-label="Copy"
                      className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
