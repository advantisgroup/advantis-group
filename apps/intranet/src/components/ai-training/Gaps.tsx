"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CircleHelp, MessagesSquare, Plus, RotateCcw, ScanSearch, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAiRun } from "@/components/ai/use-ai-run";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

import { useAiTrainingApi } from "./shared";

type Status = "open" | "answered" | "dismissed";

export function Gaps() {
  const t = useTranslations("AiTraining.gaps");
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("open");
  const gaps = useQuery(api.aiTraining.gaps.list, { status });
  const counts = useQuery(api.aiTraining.access.overview);
  const setGapStatus = useMutation(api.aiTraining.gaps.setStatus);
  const createSession = useMutation(api.aiTraining.sessions.create);
  const [adding, setAdding] = useState(false);
  const trainingApi = useAiTrainingApi();
  const check = useAiRun({ subjectKey: "aiTraining:check" });
  const checking = check.state === "working";

  async function answer(gapId: Id<"aiTrainingGaps">) {
    const id = await createSession({ gapId });
    router.push(`/ki-pflege/training?s=${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={() =>
              void trainingApi
                .check()
                .then(() => toast.success(t("checkStarted")))
                .catch(() => toast.error(t("checkFailed")))
            }
          >
            <ScanSearch />
            {checking ? t("checking") : t("check")}
          </Button>
          <InfoTip text={t("checkHint")} />
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {t("add")}
          </Button>
        </div>
      </div>
      {check.state === "done" && check.text && (
        <p className="text-sm text-muted-foreground">{check.text}</p>
      )}

      <CountTabs<Status>
        value={status}
        onChange={setStatus}
        tabs={[
          { value: "open", label: t("status.open"), count: counts?.openGaps },
          { value: "answered", label: t("status.answered") },
          { value: "dismissed", label: t("status.dismissed") },
        ]}
      />

      {gaps === undefined ? (
        <Skeleton className="h-40" />
      ) : gaps.length === 0 ? (
        <EmptyState icon={<CircleHelp />} title={t(`empty.${status}`)} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {gaps.map((gap) => (
            <li key={gap._id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{gap.question}</p>
                {gap.detail && <p className="text-sm text-muted-foreground">{gap.detail}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="muted">{t(`source.${gap.source}`)}</Badge>
                  {gap.count > 1 && (
                    <Badge variant="warning">{t("asked", { count: gap.count })}</Badge>
                  )}
                  <span>{formatDateTime(gap.updatedAt, locale)}</span>
                  {gap.createdByName && <span>· {gap.createdByName}</span>}
                  {gap.resolvedByName && (
                    <span>· {t("resolvedBy", { name: gap.resolvedByName })}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {gap.status === "open" ? (
                  <>
                    <Button size="sm" onClick={() => void answer(gap._id)}>
                      <MessagesSquare />
                      {t("answer")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void setGapStatus({ gapId: gap._id, status: "dismissed" })}
                    >
                      <X />
                      {t("dismiss")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void setGapStatus({ gapId: gap._id, status: "open" })}
                  >
                    <RotateCcw />
                    {t("reopen")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddGapDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function AddGapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("AiTraining.gaps");
  const add = useMutation(api.aiTraining.gaps.add);
  const [question, setQuestion] = useState("");
  const [detail, setDetail] = useState("");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("addTitle")}
      description={t("addHint")}
      footer={
        <Button
          disabled={!question.trim()}
          onClick={() =>
            void add({ question, detail: detail || undefined }).then(() => {
              setQuestion("");
              setDetail("");
              onOpenChange(false);
            })
          }
        >
          {t("add")}
        </Button>
      }
    >
      <div className="space-y-3">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("questionPlaceholder")}
        />
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={t("detailPlaceholder")}
          className="min-h-[72px]"
        />
      </div>
    </ResponsiveDialog>
  );
}
