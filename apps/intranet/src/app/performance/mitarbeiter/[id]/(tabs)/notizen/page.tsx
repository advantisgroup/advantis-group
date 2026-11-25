"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

/** "Interne Notizen" about an employee — admins only; the employee never
 * sees them (the server refuses everyone else, `performance/notes.ts`). */
export default function EmployeeNotesPage() {
  const t = useTranslations("Performance.notes");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const detail = useEmployeeDetailData();
  const notes = useQuery(api.performance.notes.list, { employeeId });
  const add = useMutation(api.performance.notes.add);
  const update = useMutation(api.performance.notes.update);
  const remove = useMutation(api.performance.notes.remove);
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: Id<"performanceNotes">; text: string } | null>(null);

  async function onAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await add({ employeeId, text: draft });
      setDraft("");
      toast.success(t("added"));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit() {
    if (!editing || !editing.text.trim()) return;
    try {
      await update({ id: editing.id, text: editing.text });
      setEditing(null);
      toast.success(t("saved"));
    } catch (err) {
      handleError(err);
    }
  }

  async function onDelete(id: Id<"performanceNotes">) {
    const ok = await confirm({
      title: t("deleteConfirm"),
      description: t("deleteHint"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await remove({ id });
      toast.success(t("deleted"));
    } catch (err) {
      handleError(err);
    }
  }

  if (notes === undefined) return <PerformanceContentSkeleton />;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {t("hint", { name: detail?.employee.name ?? "" })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            maxLength={5000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void onAdd();
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void onAdd()} disabled={saving || !draft.trim()}>
              {t("add")}
            </Button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border border-border/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{note.authorName}</span>
                    {" · "}
                    {formatDateTime(note.createdAt, locale)}
                    {note.updatedAt && (
                      <> · {t("edited", { date: formatDateTime(note.updatedAt, locale) })}</>
                    )}
                  </div>
                  {editing?.id !== note.id && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditing({ id: note.id, text: note.text })}
                        aria-label={t("edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void onDelete(note.id)}
                        aria-label={t("delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {editing?.id === note.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editing.text}
                      onChange={(e) => setEditing({ id: note.id, text: e.target.value })}
                      rows={3}
                      maxLength={5000}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void onSaveEdit()}
                        disabled={!editing.text.trim()}
                      >
                        {t("save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{note.text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
