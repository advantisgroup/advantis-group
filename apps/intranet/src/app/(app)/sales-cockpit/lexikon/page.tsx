"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatFileSize, uploadToConvex } from "@/lib/upload";

const TEXT_EXTENSIONS = ["txt", "csv", "md", "markdown", "html", "htm", "json", "log", "xml"];
const MAX_LEX_FILE_BYTES = 4.2 * 1024 * 1024;

function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.includes(ext);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lesefehler"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

export default function SalesCockpitLexikonPage() {
  const t = useTranslations("SalesCockpit");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const entries = useQuery(api.salesCockpit.lexikon.listLexikon);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const uploadLexikon = useMutation(api.salesCockpit.lexikon.uploadLexikon);
  const removeLexikon = useMutation(api.salesCockpit.lexikon.removeLexikon);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [titel, setTitel] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchHits = useQuery(
    api.salesCockpit.lexikon.searchLexikon,
    searchQuery ? { query: searchQuery } : "skip",
  );

  const handleUpload = async () => {
    if (!titel.trim()) {
      toast.error(t("bitteTitel"));
      return;
    }
    if (!file) {
      toast.error(t("bitteDatei"));
      return;
    }
    if (file.size > MAX_LEX_FILE_BYTES) {
      toast.error(t("dateiZuGross"));
      return;
    }
    setUploading(true);
    try {
      const isText = isTextFile(file.name);
      const content = isText ? await readAsText(file) : undefined;
      const storageId = await uploadToConvex(() => generateUploadUrl({}), file);
      await uploadLexikon({
        titel: titel.trim(),
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        fileName: file.name,
        storageId,
        size: file.size,
        isText,
        content,
      });
      setTitel("");
      setTags("");
      setFile(null);
      setUploadOpen(false);
      toast.success(t("eintragAufgenommen"));
    } catch (error) {
      handleError(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (entryId: Id<"salesCockpitLexikon">, titelValue: string) => {
    const ok = await confirm({
      title: t("eintragLoeschenTitel"),
      description: t("eintragLoeschenBeschreibung", { titel: titelValue }),
      details: [{ label: tc("fieldTitle"), value: titelValue }],
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeLexikon({ entryId });
      toast.success(t("eintragGeloescht"));
    } catch (error) {
      handleError(error);
    }
  };

  const showingSearch = searchQuery.length > 0;
  const list = showingSearch ? searchHits : entries;
  const urls = useQuery(
    api.files.getUrls,
    list && list.length > 0 ? { storageIds: list.map((e) => e.storageId) } : "skip",
  );

  return (
    <div className="space-y-5">
      <PageHeaderActions
        actions={[
          {
            key: "upload",
            label: t("neuenEintragHochladen"),
            icon: Upload,
            onClick: () => setUploadOpen(true),
          },
        ]}
      />

      <ResponsiveDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title={t("neuenEintragHochladen")}
        footer={
          <Button onClick={() => void handleUpload()} disabled={uploading}>
            <Upload className="size-3.5" />
            {t("insLexikonAufnehmen")}
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">{t("titel")}</Label>
            <Input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder={t("lexTitelPlaceholder")}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">{t("stichworte")}</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("lexTagsPlaceholder")}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">{t("datei")}</Label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("lexUploadHint")}</p>
          </div>
        </div>
      </ResponsiveDialog>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <h2 className="text-base font-semibold">{t("sucheImLexikon")}</h2>
          <div className="flex gap-2.5">
            <Input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInput(v);
                if (!v) setSearchQuery("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchQuery(searchInput.trim());
              }}
              placeholder={t("lexSearchPlaceholder")}
            />
            <Button variant="outline" onClick={() => setSearchQuery(searchInput.trim())}>
              {t("suchen")}
            </Button>
          </div>

          {list === undefined ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title={showingSearch ? t("lexNoHits") : t("lexikonLeer")}
            />
          ) : (
            <div className="divide-y divide-border/70">
              {list.map((entry) => (
                <div
                  key={entry._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <b className="text-sm">{entry.titel}</b>
                    <p className="text-xs text-muted-foreground">
                      {entry.fileName} · {formatFileSize(entry.size)}
                      {entry.isText && ` · ${t("volltextDurchsuchbar")}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="warning">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!urls?.[entry.storageId]}
                      onClick={() => window.open(urls![entry.storageId]!, "_blank")}
                    >
                      {t("oeffnen")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDelete(entry._id, entry.titel)}
                    >
                      {t("loeschen")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
