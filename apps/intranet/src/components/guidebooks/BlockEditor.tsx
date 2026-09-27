"use client";

import { useRef } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import {
  AlertTriangle,
  Code2,
  GripVertical,
  ImagePlus,
  Info,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { type Block, type BlockType, emptyBlock } from "@/lib/guidebook-blocks";
import { MAX_ATTACHMENT_BYTES, uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";

const BLOCK_META: Record<BlockType, { icon: typeof Type; labelKey: string }> = {
  text: { icon: Type, labelKey: "blockText" },
  image: { icon: ImagePlus, labelKey: "blockImage" },
  callout: { icon: Info, labelKey: "blockCallout" },
  code: { icon: Code2, labelKey: "blockCode" },
};

function ImageBlockEditor({
  block,
  onSelectFile,
  onCaptionChange,
}: {
  block: Extract<Block, { type: "image" }>;
  onSelectFile: (file: File) => void;
  onCaptionChange: (caption: string) => void;
}) {
  const t = useTranslations("Guidebooks");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelectFile(file);
          e.target.value = "";
        }}
      />
      {block.url ? (
        <div className="relative">
          <img src={block.url} alt="" className="max-h-72 w-auto rounded-lg border border-border" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute right-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow ring-1 ring-border hover:bg-accent"
          >
            {t("replaceImage")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Upload className="size-5" />
          {t("uploadImage")}
        </button>
      )}
      <input
        value={block.caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        placeholder={t("captionPlaceholder")}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </div>
  );
}

/**
 * The block-based guidebook page editor: an ordered list of text / image /
 * callout / code blocks, reordered by dragging (native HTML5 DnD — no extra
 * dependency). `RichTextEditor` (also used by announcements) provides the
 * text/callout formatting, including a "Keyboard key" toolbar button for
 * inline `<kbd>` badges.
 */
export function BlockEditor({
  blocks,
  onChange,
  dragIndex,
  onDragIndexChange,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  dragIndex: number | null;
  onDragIndexChange: (index: number | null) => void;
}) {
  const t = useTranslations("Guidebooks");
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  function update(index: number, next: Block) {
    onChange(blocks.map((b, i) => (i === index ? next : b)));
  }
  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }
  function append(type: BlockType) {
    onChange([...blocks, emptyBlock(type)]);
  }
  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex > dragIndex ? targetIndex - 1 : targetIndex, 0, moved);
    onChange(next);
    onDragIndexChange(null);
  }

  async function onImageSelected(index: number, file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t("attachTooLarge"));
      return;
    }
    const block = blocks[index];
    if (block.type !== "image") return;
    try {
      const storageId = await uploadToConvex(
        () => generateUploadUrl({}),
        file,
        () => {},
      );
      update(index, { ...block, storageId, url: URL.createObjectURL(file) });
    } catch {
      toast.error(t("uploadFailed"));
    }
  }

  return (
    <div className="space-y-2">
      {blocks.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("emptyEditor")}
        </p>
      )}
      {blocks.map((block, index) => {
        const meta = BLOCK_META[block.type];
        return (
          <div
            key={block.id}
            draggable
            onDragStart={() => onDragIndexChange(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
            className={cn(
              "group rounded-lg border border-border/70 bg-card p-3",
              dragIndex === index && "opacity-50",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex cursor-grab items-center gap-1.5 text-xs font-medium text-muted-foreground active:cursor-grabbing">
                <GripVertical className="size-3.5" />
                <meta.icon className="size-3.5" />
                {t(meta.labelKey)}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t("removeBlock")}
                className="text-muted-foreground opacity-100 transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {block.type === "text" && (
              <RichTextEditor
                value={block.html}
                onChange={(html) => update(index, { ...block, html })}
                placeholder={t("textPlaceholder")}
                minHeight="min-h-[6rem]"
              />
            )}

            {block.type === "callout" && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {(["info", "warning"] as const).map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => update(index, { ...block, variant })}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        block.variant === variant
                          ? variant === "info"
                            ? "border-info bg-info/10 text-info"
                            : "border-warn bg-warn/10 text-warn"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {variant === "info" ? (
                        <Info className="size-3" />
                      ) : (
                        <AlertTriangle className="size-3" />
                      )}
                      {t(variant === "info" ? "calloutInfo" : "calloutWarning")}
                    </button>
                  ))}
                </div>
                <RichTextEditor
                  value={block.html}
                  onChange={(html) => update(index, { ...block, html })}
                  placeholder={t("calloutPlaceholder")}
                  minHeight="min-h-[4rem]"
                />
              </div>
            )}

            {block.type === "image" && (
              <ImageBlockEditor
                block={block}
                onSelectFile={(file) => void onImageSelected(index, file)}
                onCaptionChange={(caption) => update(index, { ...block, caption })}
              />
            )}

            {block.type === "code" && (
              <textarea
                value={block.code}
                onChange={(e) => update(index, { ...block, code: e.target.value })}
                placeholder={t("codePlaceholder")}
                rows={4}
                className="w-full rounded-md border border-border bg-muted/40 p-2.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {(Object.keys(BLOCK_META) as BlockType[]).map((type) => {
          const meta = BLOCK_META[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => append(type)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <meta.icon className="size-3.5" />
              {t(meta.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
