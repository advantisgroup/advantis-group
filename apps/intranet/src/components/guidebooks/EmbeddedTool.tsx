"use client";

/**
 * Bettet eine eigenständige HTML-Seite aus public/tools/ als interaktives
 * Wiki-Tool ein (volle Breite, Kopieren in die Zwischenablage erlaubt).
 */
export function embeddedTool(src: string, title: string) {
  function EmbeddedTool() {
    return (
      <iframe
        src={src}
        title={title}
        allow="clipboard-write"
        className="h-[calc(100vh-12rem)] min-h-[600px] w-full rounded-lg border border-border bg-background"
      />
    );
  }
  return EmbeddedTool;
}
