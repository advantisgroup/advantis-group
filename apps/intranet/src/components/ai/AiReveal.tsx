import { cn } from "@/lib/utils";

/**
 * Fades words in as streamed text grows. Words already on screen keep their
 * index as key, so React leaves them mounted and only new ones animate —
 * the answer grows instead of the whole block jumping per snapshot. Plain
 * text on purpose; render the finished answer properly once it's done.
 */
export function AiReveal({ text, className }: { text: string; className?: string }) {
  const words = text.match(/\S+\s*/g) ?? [];
  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {words.map((word, i) => (
        <span key={i} className="ai-word">
          {word}
        </span>
      ))}
    </p>
  );
}
