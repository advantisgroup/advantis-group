/**
 * The block model behind the guidebook page editor (`/guidebooks/new/advanced`) — a
 * Notion-style page is just an ordered list of these, stored as one JSON
 * string (`guidebookPages.blocks`) rather than a modeled Convex union, so a
 * new block type is a client-only change.
 */

export type CalloutVariant = "info" | "warning";

export type Block =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "image"; storageId: string; url: string | null; caption: string }
  | { id: string; type: "callout"; variant: CalloutVariant; html: string }
  | { id: string; type: "code"; code: string };

export type BlockType = Block["type"];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `b${Date.now()}${Math.random().toString(36).slice(2)}`;
}

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "text":
      return { id: newId(), type: "text", html: "" };
    case "image":
      return { id: newId(), type: "image", storageId: "", url: null, caption: "" };
    case "callout":
      return { id: newId(), type: "callout", variant: "info", html: "" };
    case "code":
      return { id: newId(), type: "code", code: "" };
  }
}

export function parseBlocks(json: string): Block[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return [];
  }
}

export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks);
}

/** Every image block's storage id — for the page's denormalized `imageStorageIds` cleanup list. */
export function imageStorageIdsOf(blocks: Block[]): string[] {
  return blocks
    .filter((b): b is Extract<Block, { type: "image" }> => b.type === "image")
    .map((b) => b.storageId)
    .filter(Boolean);
}

export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page"
  );
}
