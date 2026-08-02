"use client";

import { useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useReverification } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, ShieldAlert, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import posthog from "posthog-js";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RequestId = Id<"passwordResetRequests">;

/** Clerk rejects the wrapped call with this code when the user closes the
 * step-up modal instead of verifying. */
function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "reverification_cancelled"
  );
}

function RequestHistory({ requestId }: { requestId: RequestId }) {
  const t = useTranslations("PasswordReset");
  const format = useFormatter();
  const rows = useQuery(api.passwordResets.requestHistory, { requestId });
  if (!rows) return null;

  const label = (event: string) => {
    const key = `adminEvent${event
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")}`;
    return t.has(key) ? t(key) : event;
  };

  return (
    <ol className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-foreground">{label(row.event)}</span>
            <span>
              {format.dateTime(new Date(row.at), {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {row.actorName && <span className="break-all">· {row.actorName}</span>}
            {row.actorIsAdmin && <span>· admin</span>}
            {row.reverified !== null && <span>· reverified={String(row.reverified)}</span>}
          </div>
          {row.detail && <p className="break-all font-mono opacity-80">{row.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

function RequestCard({
  request,
  highlighted,
}: {
  request: NonNullable<ReturnType<typeof useQuery<typeof api.passwordResets.listRequests>>>[number];
  highlighted: boolean;
}) {
  const t = useTranslations("PasswordReset");
  const format = useFormatter();
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Both admin actions are wrapped: the Convex function returns Clerk's
  // reverification hint instead of acting when the session hasn't been
  // re-verified in the last 10 minutes, and this hook turns that into the
  // step-up modal and a retry.
  const issue = useReverification(useAction(api.passwordResets.issueResetLink));
  const dismiss = useReverification(useMutation(api.passwordResets.dismissRequest));

  const when = (at: number) =>
    format.dateTime(new Date(at), {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function run(action: "issue" | "dismiss") {
    setBusy(true);
    try {
      if (action === "issue") {
        const result = await issue({ requestId: request.id });
        toast.success(t("adminIssued", { email: result.sentTo }));
      } else {
        await dismiss({ requestId: request.id });
        toast.success(t("adminDismissed"));
      }
      posthog.capture("password_reset_admin_action", { scope: request.scope, action });
    } catch (error) {
      if (isCancelled(error)) {
        toast.info(t("adminReverifyCancelled"));
      } else {
        toast.error(action === "issue" ? t("adminIssueFailed") : t("adminReverifyStale"));
      }
      posthog.capture("password_reset_admin_action_failed", { scope: request.scope, action });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-card p-4 ${
        highlighted ? "border-primary" : "border-border/70"
      }`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-medium">{request.targetEmail}</span>
          {request.selfService ? (
            <Badge variant="outline">{t("adminSelf")}</Badge>
          ) : (
            <Badge variant="warning">{t("adminMismatch")}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {request.scope === "hr" ? t("areaHr") : t("areaPerformance")}
          </Badge>
          {request.targetCompanyName && (
            <Badge variant="outline">{request.targetCompanyName}</Badge>
          )}
        </div>
        <p className="break-words text-xs text-muted-foreground">
          {t("adminFiledBy")}:{" "}
          {request.requestedByEmail
            ? (request.requestedByName ?? request.requestedByEmail)
            : t("adminAnonymous")}
          {" · "}
          {t("adminFiledAt")} {when(request.createdAt)}
        </p>
      </div>

      {!request.targetExists && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          {t("adminUnknownAccountHint")}
        </p>
      )}
      {request.targetExists && !request.selfService && (
        <p className="mt-3 flex items-start gap-2 text-xs text-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
          {t("adminMismatchHint")}
        </p>
      )}

      {request.status === "pending" ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {request.targetExists && (
              <Button size="sm" disabled={busy} onClick={() => void run("issue")}>
                {busy ? t("adminIssuing") : t("adminIssue")}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("dismiss")}>
              {t("adminDismiss")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? t("adminHistoryHide") : t("adminHistory")}
            </Button>
          </div>
          {request.targetExists && (
            <p className="text-xs text-muted-foreground">{t("adminLinkGoesTo")}</p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">
            {request.status === "issued" ? t("adminStatusIssued") : t("adminStatusDismissed")}
          </Badge>
          {request.handledByName && request.handledAt && (
            <span className="break-words">
              {t("adminHandledBy", {
                name: request.handledByName,
                time: when(request.handledAt),
              })}
            </span>
          )}
          {request.activeLinkExpiresAt && (
            <span>{t("adminLinkLive", { time: when(request.activeLinkExpiresAt) })}</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("adminHistoryHide") : t("adminHistory")}
          </Button>
        </div>
      )}

      {showHistory && <RequestHistory requestId={request.id} />}
    </div>
  );
}

export function PasswordResetsPanel() {
  const t = useTranslations("PasswordReset");
  const params = useSearchParams();
  const highlighted = params.get("request");
  const pending = useQuery(api.passwordResets.listRequests, { status: "pending" });
  const handled = useQuery(api.passwordResets.listRequests, { status: "handled" });

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          {t("adminPending")}
          {pending && pending.length > 0 && (
            <Badge variant="warning" className="ml-2">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="handled">{t("adminHandled")}</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="space-y-3">
        {pending?.length === 0 ? (
          <EmptyState icon={<KeyRound />} title={t("adminEmpty")} />
        ) : (
          pending?.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              highlighted={highlighted === request.id}
            />
          ))
        )}
      </TabsContent>

      <TabsContent value="handled" className="space-y-3">
        {handled?.length === 0 ? (
          <EmptyState icon={<KeyRound />} title={t("adminEmptyHandled")} />
        ) : (
          handled?.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              highlighted={highlighted === request.id}
            />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}
