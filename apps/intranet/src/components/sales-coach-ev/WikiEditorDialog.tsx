"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useEdenApi } from "@/lib/eden";
import { createWikiArticle, deleteWikiArticle, updateWikiArticle } from "@/lib/sales-coach-ev-api";

import { WIKI_CATEGORIES } from "./constants";
import { type WikiArticle, type WikiCategory } from "./types";

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
  const handleError = useErrorHandler();
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<WikiCategory>("Produktdaten");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(article?.title ?? "");
    setCat(article?.cat ?? "Produktdaten");
    setTags(article?.tags ?? "");
    setBody(article?.body ?? "");
    setUrl(article?.url ?? "");
  }, [open, article]);

  const save = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        cat,
        tags: tags.trim(),
        body: body.trim(),
        url: url.trim() || undefined,
      };
      if (article) await updateWikiArticle(eden, article._id, input);
      else await createWikiArticle(eden, input);
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
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleError(err, t("wikiDeleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{article ? t("wikiEditTitle") : t("wikiNewTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5">
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !title.trim() || !body.trim()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
