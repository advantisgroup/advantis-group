"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { useEdenApi } from "@/lib/eden";
import {
  analyzeWikiDocument,
  createWikiArticle,
  deleteWikiArticle,
  updateWikiArticle,
} from "@/lib/sales-coach-ev-api";
import { formatFileSize, uploadToConvex } from "@/lib/upload";

import { WIKI_CATEGORIES } from "./constants";
import { type WikiArticle, type WikiCategory } from "./types";

const MAX_WIKI_DOC_BYTES = 8 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface AttachedDoc {
  storageId: Id<"_storage">;
  fileName: string;
  fileContentType?: string;
  fileSize?: number;
}

function fileToAttachedDoc(article: WikiArticle | null): AttachedDoc | null {
  if (!article?.storageId || !article.fileName) return null;
  return {
    storageId: article.storageId as Id<"_storage">,
    fileName: article.fileName,
    fileContentType: article.fileContentType,
    fileSize: article.fileSize,
  };
}

/** .docx text extraction runs client-side (mammoth, already bundled for the
 * file viewer's DocxPreview) — only a PDF's raw bytes go to the server,
 * where Claude reads it natively. */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export function WikiEditorDialog({
  open,
  onOpenChange,
  article,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: WikiArticle | null;
  onSaved: () => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const eden = useEdenApi();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const { openFileViewer } = useFileViewer();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const deleteFile = useMutation(api.files.deleteFile);

  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<WikiCategory>("Produktdaten");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [doc, setDoc] = useState<AttachedDoc | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // The article's own persisted attachment (if any), so save/cancel/replace
  // only ever delete storage the user actually changed away from this
  // session — never the file an already-saved article still points to.
  const originalDocRef = useRef<AttachedDoc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(article?.title ?? "");
    setCat(article?.cat ?? "Produktdaten");
    setTags(article?.tags ?? "");
    setBody(article?.body ?? "");
    setUrl(article?.url ?? "");
    const existingDoc = fileToAttachedDoc(article);
    setDoc(existingDoc);
    originalDocRef.current = existingDoc;
  }, [open, article]);

  /** Deletes `doc` if it's a not-yet-saved upload from this session —
   *  never the article's already-persisted attachment. */
  function discardUnsavedDoc(current: AttachedDoc | null) {
    if (current && current.storageId !== originalDocRef.current?.storageId) {
      void deleteFile({ storageId: current.storageId }).catch(() => {});
    }
  }

  const close = (nextOpen: boolean) => {
    if (!nextOpen) discardUnsavedDoc(doc);
    onOpenChange(nextOpen);
  };

  const handleFileSelect = async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isDocx = file.type === DOCX_MIME || ext === "docx";
    const isText = file.type.startsWith("text/") || ext === "txt" || ext === "md";
    if (!isPdf && !isDocx && !isText) {
      toast.error(t("wikiDocumentUnsupported"));
      return;
    }
    if (file.size > MAX_WIKI_DOC_BYTES) {
      toast.error(t("wikiDocumentTooLarge", { max: "8 MB" }));
      return;
    }

    setAnalyzing(true);
    try {
      const [extracted, storageId] = await Promise.all([
        (async () => {
          if (isPdf) return analyzeWikiDocument(apiClient, { file });
          const text = isDocx ? await extractDocxText(file) : await file.text();
          return analyzeWikiDocument(apiClient, { text });
        })(),
        uploadToConvex(() => generateUploadUrl({}), file),
      ]);
      discardUnsavedDoc(doc);
      setDoc({
        storageId,
        fileName: file.name,
        fileContentType: file.type || undefined,
        fileSize: file.size,
      });
      setTitle(extracted.title || title);
      setCat(extracted.cat);
      setTags(extracted.tags || tags);
      setBody(extracted.body || body);
      toast.success(t("wikiDocumentAnalyzed"));
    } catch (err) {
      handleError(err, t("wikiDocumentAnalyzeFailed"));
    } finally {
      setAnalyzing(false);
    }
  };

  const removeDocument = () => {
    discardUnsavedDoc(doc);
    setDoc(null);
  };

  const save = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const fileChanged = doc?.storageId !== originalDocRef.current?.storageId;
      const input = {
        title: title.trim(),
        cat,
        tags: tags.trim(),
        body: body.trim(),
        url: url.trim() || undefined,
        ...(fileChanged && doc
          ? {
              storageId: doc.storageId,
              fileName: doc.fileName,
              fileContentType: doc.fileContentType,
              fileSize: doc.fileSize,
            }
          : {}),
        ...(fileChanged && !doc ? { removeFile: true } : {}),
      };
      if (article) await updateWikiArticle(eden, article._id, input);
      else await createWikiArticle(eden, input);
      // The file just landed on the saved article — later cancels/closes
      // must not treat it as an orphaned upload anymore.
      originalDocRef.current = doc;
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleError(err, t("wikiSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!article) return;
    setSaving(true);
    try {
      await deleteWikiArticle(eden, article._id);
      originalDocRef.current = null;
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleError(err, t("wikiDeleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{article ? t("wikiEditTitle") : t("wikiNewTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("wikiFieldDocument")}
            </label>
            {doc ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                {typeof doc.fileSize === "number" && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() =>
                    openFileViewer({
                      storageId: doc.storageId,
                      name: doc.fileName,
                      contentType: doc.fileContentType,
                      size: doc.fileSize,
                    })
                  }
                >
                  {t("wikiDocumentView")}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={removeDocument}
                  disabled={analyzing}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
              >
                {analyzing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {analyzing ? t("wikiDocumentAnalyzing") : t("wikiDocumentUpload")}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFileSelect(file);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("wikiFieldTitle")}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("wikiFieldTitlePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                {t("wikiFieldCategory")}
              </label>
              <Select value={cat} onValueChange={(v) => setCat(v as WikiCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIKI_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                {t("wikiFieldTags")}
              </label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Wallbox, AC, Preis"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("wikiFieldBody")}
            </label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("wikiFieldUrl")}
            </label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter>
          {article && (
            <Button
              variant="outline"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={remove}
              disabled={saving}
            >
              {t("wikiDelete")}
            </Button>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving || analyzing || !title.trim() || !body.trim()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
