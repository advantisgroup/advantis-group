"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type RecognizedItem, useOfficeApi } from "@/lib/office-api";
import { cn } from "@/lib/utils";

import { type DeskId, ITEM_KINDS, type ItemKind, KindIcon } from "./shared";

const MAX_PHOTOS = 6;

interface Row extends RecognizedItem {
  key: number;
  keep: boolean;
}

/**
 * The inventory round on the phone: take photos and/or dictate what's there,
 * the AI suggests a list, the admin ticks it off and saves. Stays open after
 * saving so the next shelf or box can follow straight away.
 */
export function AiCaptureDialog({
  open,
  onOpenChange,
  deskId,
  placeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** None = storage. */
  deskId?: DeskId;
  placeName: string;
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("ai.title")}
      description={t("ai.description", { place: placeName })}
      contentClassName="max-w-2xl"
    >
      {open && (
        <CaptureFlow deskId={deskId} placeName={placeName} onDone={() => onOpenChange(false)} />
      )}
    </ResponsiveDialog>
  );
}

function CaptureFlow({
  deskId,
  placeName,
  onDone,
}: {
  deskId?: DeskId;
  placeName: string;
  onDone: () => void;
}) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const officeApi = useOfficeApi();
  const createItem = useMutation(api.office.createItem);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"recognize" | "save" | null>(null);

  // Object URLs for the thumbnails are freed when the dialog closes.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const added = [...list]
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
  }

  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    setPhotos((prev) => prev.filter((photo) => photo.url !== url));
  }

  async function recognize() {
    setBusy("recognize");
    try {
      const { items } = await officeApi.recognize(
        photos.map((photo) => photo.file),
        text,
        placeName,
      );
      if (items.length === 0) {
        toast.info(t("ai.nothing"));
        return;
      }
      setRows(items.map((item, key) => ({ ...item, key, keep: true })));
    } catch (e) {
      handleError(e, t("ai.failed"));
    } finally {
      setBusy(null);
    }
  }

  function update(key: number, change: Partial<Row>) {
    setRows((prev) => prev?.map((row) => (row.key === key ? { ...row, ...change } : row)) ?? null);
  }

  async function save() {
    const chosen = (rows ?? []).filter((row) => row.keep && row.name.trim());
    if (chosen.length === 0) return;
    setBusy("save");
    let saved = 0;
    try {
      for (const row of chosen) {
        await createItem({
          kind: row.kind,
          name: row.name,
          spec: row.spec,
          serialNumber: row.serialNumber,
          inventoryNumber: row.inventoryNumber,
          quantity: Math.max(1, Math.round(row.quantity) || 1),
          defective: row.defective,
          note: row.unsure ? row.note : undefined,
          deskId,
        });
        saved++;
      }
      toast.success(t("ai.saved", { count: saved }));
      // Ready for the next shelf.
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setPhotos([]);
      setText("");
      setRows(null);
    } catch (e) {
      // Whatever was saved before the error stays; take it out of the list.
      setRows((prev) => prev?.filter((row) => !chosen.slice(0, saved).includes(row)) ?? null);
      handleError(e, t("error"));
    } finally {
      setBusy(null);
    }
  }

  if (rows) {
    const count = rows.filter((row) => row.keep).length;
    return (
      <>
        <p className="text-sm text-muted-foreground">{t("ai.review")}</p>
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn(
                "space-y-2 rounded-lg border border-border p-3",
                !row.keep && "opacity-50",
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  className="mt-2.5"
                  checked={row.keep}
                  onCheckedChange={(checked) => update(row.key, { keep: checked === true })}
                  aria-label={row.name}
                />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[10rem_1fr_5rem]">
                  <Select
                    value={row.kind}
                    onValueChange={(value) => update(row.key, { kind: value as ItemKind })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          <span className="flex items-center gap-2">
                            <KindIcon kind={kind} />
                            {t(`kinds.${kind}`)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.name}
                    aria-label={t("itemDialog.name")}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                  />
                  <Input
                    inputMode="numeric"
                    value={String(row.quantity)}
                    aria-label={t("itemDialog.quantity")}
                    onChange={(e) => update(row.key, { quantity: Number(e.target.value) || 0 })}
                  />
                  <Input
                    className="sm:col-span-3"
                    value={row.spec}
                    placeholder={t("itemDialog.spec")}
                    onChange={(e) => update(row.key, { spec: e.target.value })}
                  />
                  {(row.serialNumber || row.inventoryNumber) && (
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                      {[
                        row.serialNumber && t("item.serial", { value: row.serialNumber }),
                        row.inventoryNumber && t("item.inventory", { value: row.inventoryNumber }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              {row.unsure && (
                <p className="flex items-center gap-2 pl-7 text-xs text-muted-foreground">
                  <Badge variant="warning">{t("ai.unsure")}</Badge>
                  {row.note}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setRows(null)} disabled={!!busy}>
            {t("ai.back")}
          </Button>
          <Button onClick={() => void save()} disabled={!!busy || count === 0}>
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}
            {t("ai.save", { count })}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => cameraRef.current?.click()}
          disabled={photos.length >= MAX_PHOTOS}
        >
          <Camera className="size-4" />
          {t("ai.camera")}
        </Button>
        <Button
          variant="outline"
          onClick={() => galleryRef.current?.click()}
          disabled={photos.length >= MAX_PHOTOS}
        >
          <ImagePlus className="size-4" />
          {t("ai.gallery")}
        </Button>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((photo) => (
            <div
              key={photo.url}
              className="relative aspect-square overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.url)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5"
                aria-label={t("ai.removePhoto")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Textarea
        rows={3}
        value={text}
        placeholder={t("ai.textPlaceholder")}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t("ai.hint")}</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone} disabled={!!busy}>
          {t("ai.done")}
        </Button>
        <Button
          onClick={() => void recognize()}
          disabled={!!busy || (photos.length === 0 && !text.trim())}
        >
          {busy === "recognize" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {t(busy === "recognize" ? "ai.recognizing" : "ai.recognize")}
        </Button>
      </div>
    </>
  );
}
