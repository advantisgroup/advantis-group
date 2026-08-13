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
    <div className="flex-1 overflow-y-auto">
      {SCRIPT_SECTIONS.map((section) => {
        const open = openSections.has(section.id);
        const isActivePath = section.id === activeSectionId;
        return (
          <div key={section.id} className="border-b border-border">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold text-foreground/90 hover:bg-muted/40"
            >
              <span className={cn(isActivePath && "text-primary")}>{section.title}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open && (
              <div className="space-y-1.5 px-2.5 pb-2.5">
                {section.cards.map((card) => (
                  <div
                    key={card.label}
                    className={cn(
                      "group relative rounded-lg border border-border bg-muted/40 p-2.5 text-[13px] leading-relaxed",
                      card.highlight && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </div>
                    <div className="pr-6 text-foreground/90">{card.text}</div>
                    <button
                      type="button"
                      onClick={() => copy(card.text)}
                      className="absolute right-2 top-2 rounded border border-border bg-card p-1 opacity-0 transition-opacity hover:border-primary hover:text-primary group-hover:opacity-100"
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
