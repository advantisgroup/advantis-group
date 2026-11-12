"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { BookOpen, Check, Lightbulb, ScrollText, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { staticGuidebookSlugs } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { RichText } from "@/components/ui/rich-text";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Proposal = FunctionReturnType<typeof api.aiTraining.proposals.list>[number];
type Status = "open" | "applied" | "rejected";

const isWiki = (p: Proposal) => p.kind === "wiki_new" || p.kind === "wiki_update";

export function Proposals() {
  const t = useTranslations("AiTraining.proposals");
  const [status, setStatus] = useState<Status>("open");
  const rows = useQuery(api.aiTraining.proposals.list, { status });
  const counts = useQuery(api.aiTraining.access.overview);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <CountTabs<Status>
        value={status}
        onChange={setStatus}
        tabs={[
          { value: "open", label: t("status.open"), count: counts?.openProposals },
          { value: "applied", label: t("status.applied") },
          { value: "rejected", label: t("status.rejected") },
        ]}
      />
      {rows === undefined ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Lightbulb />} title={t(`empty.${status}`)} />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <ProposalCard key={p._id} proposal={p} showSession />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProposalCard({
  proposal: p,
  showSession = false,
}: {
  proposal: Proposal;
  showSession?: boolean;
}) {
  const t = useTranslations("AiTraining.proposals");
  const locale = useLocale();
  const [reviewing, setReviewing] = useState(false);
  const reject = useMutation(api.aiTraining.proposals.reject);
  const Icon = isWiki(p) ? BookOpen : ScrollText;
  return (
    <div className={cn("rounded-xl border bg-card p-4", p.status !== "open" && "opacity-75")}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.title}</span>
            <Badge variant="muted">{t(`kind.${p.kind}`)}</Badge>
            {p.status !== "open" && (
              <Badge variant={p.status === "applied" ? "success" : "outline"}>
                {t(`status.${p.status}`)}
              </Badge>
            )}
          </div>
          {p.reason && <p className="text-sm text-muted-foreground">{p.reason}</p>}
          <p className="text-xs text-muted-foreground">
            {formatDateTime(p.createdAt, locale)} · {p.createdByName}
            {showSession && p.session && (
              <>
                {" · "}
                <Link href={`/ki-pflege/training?s=${p.session._id}`} className="underline">
                  {p.session.title}
                </Link>
              </>
            )}
            {p.decidedByName && ` · ${t("decidedBy", { name: p.decidedByName })}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {p.status === "open" ? (
            <>
              <Button size="sm" onClick={() => setReviewing(true)}>
                {t("review")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void reject({ proposalId: p._id })}>
                <X />
                {t("reject")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setReviewing(true)}>
              {t("show")}
            </Button>
          )}
        </div>
      </div>
      <ReviewDialog proposal={p} open={reviewing} onOpenChange={setReviewing} />
    </div>
  );
}

function ReviewDialog({
  proposal: p,
  open,
  onOpenChange,
}: {
  proposal: Proposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AiTraining.proposals");
  const apply = useMutation(api.aiTraining.proposals.apply);
  const categories = useQuery(api.wiki.categories.list) ?? [];
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [tags, setTags] = useState(p.tags.join(", "));
  const [categoryId, setCategoryId] = useState<string>("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = p.status === "open";
  const wiki = isWiki(p);

  useEffect(() => {
    if (!open) return;
    setTitle(p.title);
    setBody(p.body);
    setTags(p.tags.join(", "));
    const byName = categories.find(
      (c) => c.name.toLowerCase() === (p.categoryName ?? "").toLowerCase(),
    );
    setCategoryId(p.entry?.categoryId ?? byName?._id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p._id]);

  async function submit() {
    setSaving(true);
    try {
      const { href } = await apply({
        proposalId: p._id,
        title,
        body,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        categoryId: categoryId ? (categoryId as Id<"wikiCategories">) : undefined,
        reservedSlugs: staticGuidebookSlugs(),
      });
      toast.success(t("applied"), {
        action: { label: t("open"), onClick: () => window.open(href, "_self") },
      });
      onOpenChange(false);
    } catch {
      toast.error(t("applyFailed"));
    } finally {
      setSaving(false);
    }
  }

  const current = p.entry
    ? { title: p.entry.thema, html: p.entry.erklaerung }
    : p.currentRule
      ? { title: p.currentRule.title, text: p.currentRule.text }
      : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-3xl"
      title={t(`kind.${p.kind}`)}
      description={p.reason}
      footer={
        editable ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={saving || !title.trim() || !body.trim()}
              onClick={() => void submit()}
            >
              <Check />
              {t("apply")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {p.entry?.changedSince && editable && (
          <p className="flex items-start gap-2 rounded-lg bg-warn/10 p-2 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("changedSince")}
          </p>
        )}
        {current && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <button
              type="button"
              className="text-sm font-medium underline-offset-2 hover:underline"
              onClick={() => setShowCurrent((v) => !v)}
            >
              {showCurrent ? t("hideCurrent") : t("showCurrent")}
            </button>
            {showCurrent && (
              <div className="mt-2 max-h-72 overflow-y-auto text-sm">
                <p className="mb-1 font-medium">{current.title}</p>
                {"html" in current ? (
                  <RichText html={current.html ?? ""} />
                ) : (
                  <p className="whitespace-pre-wrap">{current.text}</p>
                )}
              </div>
            )}
          </div>
        )}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        {wiki && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("tags")}
              disabled={!editable}
            />
            <Select value={categoryId} onValueChange={setCategoryId} disabled={!editable}>
              <SelectTrigger>
                <SelectValue placeholder={t("category")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {wiki ? (
          editable ? (
            <RichTextEditor value={body} onChange={setBody} />
          ) : (
            <RichText html={body} className="text-sm" />
          )
        ) : (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[200px]"
            disabled={!editable}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
