import { cn } from "@/lib/utils";

/** Text exactly as the model saw or wrote it: whitespace kept, nothing
 * rendered as markup, so what's shown is what was sent. */
export function AiVerbatim({ children, className }: { children: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-muted/30 p-4 font-mono text-[12px] leading-relaxed",
        className,
      )}
    >
      {children}
    </pre>
  );
}
