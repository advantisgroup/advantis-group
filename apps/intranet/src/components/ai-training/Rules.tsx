"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

type Rule = FunctionReturnType<typeof api.aiTraining.rules.list>[number];

export function Rules() {
  const t = useTranslations("AiTraining.rules");
  const locale = useLocale();
  const rules = useQuery(api.aiTraining.rules.list);
  const remove = useMutation(api.aiTraining.rules.remove);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {t("add")}
        </Button>
      </div>
      {rules === undefined ? (
        <Skeleton className="h-40" />
      ) : rules.length === 0 ? (
        <EmptyState icon={<ScrollText />} title={t("empty")} />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule._id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.title}</span>
                    {rule.builtin && <Badge variant="muted">{t("builtin")}</Badge>}
                    {!rule.active && <Badge variant="outline">{t("inactive")}</Badge>}
                  </div>
                  {rule.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      {rule.updatedByName} · {formatDateTime(rule.updatedAt, locale)}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(rule)}>
                  <Pencil />
                  {t("edit")}
                </Button>
                {!rule.builtin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      void remove({ ruleId: rule._id as Id<"aiTrainingRules"> });
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{rule.text}</p>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <RuleDialog rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function RuleDialog({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const t = useTranslations("AiTraining.rules");
  const save = useMutation(api.aiTraining.rules.save);
  const [title, setTitle] = useState(rule?.title ?? "");
  const [text, setText] = useState(rule?.text ?? "");
  const [active, setActive] = useState(rule?.active ?? true);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      contentClassName="max-w-2xl"
      title={rule ? t("editTitle") : t("addTitle")}
      description={t("hint")}
      footer={
        <Button
          disabled={!title.trim() || !text.trim()}
          onClick={() =>
            void save({ ruleId: rule?._id, title, text, active })
              .then(onClose)
              .catch(() => toast.error(t("saveFailed")))
          }
        >
          {t("save")}
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
        />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("textPlaceholder")}
          className="min-h-[240px]"
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          {t("active")}
        </label>
      </div>
    </ResponsiveDialog>
  );
}
