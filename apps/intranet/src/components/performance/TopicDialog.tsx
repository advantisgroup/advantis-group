"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
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

type TopicStatus = "offen" | "erreicht" | "nicht_erreicht";

function TopicForm({
  topic,
  employeeId,
  ym,
  token,
  onCancel,
  onSaved,
}: {
  topic: Doc<"performanceTopics"> | null;
  employeeId: Id<"performanceEmployees">;
  ym: string;
  token: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const saveTopic = useMutation(api.performanceTopics.saveTopic);
  const [text, setText] = useState(topic?.topic ?? "");
  const [todo, setTodo] = useState(topic?.todo ?? "");
  const [endDate, setEndDate] = useState(topic?.endDate ?? "");
  const [status, setStatus] = useState<TopicStatus>(topic?.status ?? "offen");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveTopic({
        token,
        employeeId,
        id: topic?._id,
        ym,
        topic: trimmed,
        todo: todo.trim() || undefined,
        endDate: endDate || undefined,
        status,
      });
      onSaved();
      toast.success(topic ? t("topicUpdatedToast") : t("topicCreatedToast"));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
        <DialogTitle className="leading-snug">
          {topic ? t("topicEditTitle") : t("topicNewTitle")}
        </DialogTitle>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("topicLabel")}</label>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("topicTodoLabel")}</label>
          <Textarea value={todo} onChange={(e) => setTodo(e.target.value)} rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("topicEndDateLabel")}
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("topicStatusLabel")}
            </label>
            <Select value={status} onValueChange={(v) => setStatus(v as TopicStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offen">{t("topicStatusOpen")}</SelectItem>
                <SelectItem value="erreicht">{t("topicStatusReached")}</SelectItem>
                <SelectItem value="nicht_erreicht">{t("topicStatusMissed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          {t("topicCancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || !text.trim()}>
          {t("topicSave")}
        </Button>
      </DialogFooter>
    </>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: Doc<"performanceTopics"> | null;
  employeeId: Id<"performanceEmployees">;
  ym: string;
  token: string;
}

/** Create/edit dialog for a Performance "topic" (monthly goal/todo) — the
 * primary create/edit action never sits inline on the detail page, per
 * house style. */
export function TopicDialog({ open, onOpenChange, topic, employeeId, ym, token }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <TopicForm
          key={topic?._id ?? "new"}
          topic={topic}
          employeeId={employeeId}
          ym={ym}
          token={token}
          onCancel={() => onOpenChange(false)}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
