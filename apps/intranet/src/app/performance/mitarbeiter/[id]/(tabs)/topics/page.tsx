"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { TopicDialog } from "@/components/performance/TopicDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

export default function EmployeeTopicsPage() {
  const t = useTranslations("Performance");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const [ym] = usePerformanceYm();
  const handleError = useErrorHandler();

  const { me } = usePerformanceAccess();
  // Goals are set by admins and team leads (the server checks the exact team).
  const isAdmin = !!me && (me.isAdmin || me.dashboards.some((d) => d.canViewTeam));

  const data = useEmployeeDetailData();
  const setTopicStatus = useMutation(api.performance.topics.setTopicStatus);
  const deleteTopic = useMutation(api.performance.topics.deleteTopic);

  const [topicDialog, setTopicDialog] = useState<
    { open: true; topic: Doc<"performanceTopics"> | null } | { open: false }
  >({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Doc<"performanceTopics"> | null>(null);

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("topicsTitle")}</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={() => setTopicDialog({ open: true, topic: null })}>
              <Plus className="mr-2 h-4 w-4" />
              {t("topicNew")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {data.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("topicEmpty")}</p>
          ) : (
            data.topics.map((topic) => (
              <div
                key={topic._id}
                className="flex items-start justify-between gap-3 rounded-md border border-border/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{topic.topic}</p>
                  {topic.todo && <p className="mt-1 text-xs text-muted-foreground">{topic.todo}</p>}
                  {topic.endDate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatIsoDate(topic.endDate, locale)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={topic.status}
                    onValueChange={(v) =>
                      void setTopicStatus({
                        employeeId,
                        id: topic._id,
                        status: v as "offen" | "erreicht" | "nicht_erreicht",
                      })
                        .then(() => toast.success(t("topicStatusToast")))
                        .catch(handleError)
                    }
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offen">{t("topicStatusOpen")}</SelectItem>
                      <SelectItem value="erreicht">{t("topicStatusReached")}</SelectItem>
                      <SelectItem value="nicht_erreicht">{t("topicStatusMissed")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTopicDialog({ open: true, topic })}
                        aria-label={tc("edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTarget(topic)}
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <TopicDialog
        open={topicDialog.open}
        onOpenChange={(open) => setTopicDialog(open ? topicDialog : { open: false })}
        topic={topicDialog.open ? topicDialog.topic : null}
        employeeId={employeeId}
        ym={ym ?? data.ym}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <div className="px-6 pb-5 pt-6 pr-12">
            <DialogTitle className="leading-snug">{t("topicDeleteTitle")}</DialogTitle>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("topicCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  void deleteTopic({
                    employeeId,
                    id: deleteTarget._id,
                  })
                    .then(() => toast.success(t("topicDeletedToast")))
                    .catch(handleError);
                }
                setDeleteTarget(null);
              }}
            >
              {t("topicDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
