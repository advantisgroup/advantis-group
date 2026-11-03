"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

import { type CaseRow, CustomerNumber, StatusBadge } from "./shared";

/**
 * "Übergaben an dich" (feedback 03.11.): cases a colleague wants to hand
 * over – accept, or decline with a reason. Below, the caller's own
 * handovers that were declined, until dismissed. Shows nothing when empty.
 */
export function TransferInbox({
  asUserId,
  cases,
  onOpen,
}: {
  asUserId: Id<"users"> | null;
  cases: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const incoming = useQuery(api.performance.onboarding.transfers, asUserId ? { asUserId } : {});
  const answer = useMutation(api.performance.onboarding.answerTransfer);
  const update = useMutation(api.performance.onboarding.update);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const readOnly = !!asUserId;

  const declined = cases.filter((c) => c.transferDeclined);
  if ((incoming ?? []).length === 0 && declined.length === 0) return null;

  const respond = async (caseId: Id<"onboardingCases">, accept: boolean) => {
    if (!accept && !reason.trim()) {
      toast.error(t("transfer.reasonRequired"));
      return;
    }
    try {
      await answer({ caseId, accept, reason: accept ? undefined : reason });
      toast.success(accept ? t("transfer.accepted") : t("transfer.declined"));
      setDeclining(null);
      setReason("");
    } catch (e) {
      handleError(e, t("case.saveError"));
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      {(incoming ?? []).length > 0 && (
        <>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {t("transfer.inboxTitle")}
            <Badge variant="secondary">{incoming!.length}</Badge>
          </h2>
          <ul className="space-y-2">
            {incoming!.map((x) => (
              <li
                key={x.caseId}
                className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CustomerNumber number={x.customerNumber} className="font-medium" />
                  <StatusBadge status={x.status} />
                  {x.prio && <Badge variant="destructive">{t("prioBadge")}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {t("transfer.from", { name: x.fromName ?? "–" })}
                    {x.at ? ` · ${formatDateTime(x.at, locale)}` : ""}
                  </span>
                  {!readOnly && declining !== x.caseId && (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" onClick={() => void respond(x.caseId, true)}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {t("transfer.accept")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeclining(x.caseId);
                          setReason("");
                        }}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        {t("transfer.decline")}
                      </Button>
                    </div>
                  )}
                </div>
                {x.situation && <p className="text-xs text-muted-foreground">{x.situation}</p>}
                {x.note && <p className="whitespace-pre-wrap">{x.note}</p>}
                {declining === x.caseId && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      autoFocus
                      className="h-8 min-w-[220px] flex-1"
                      value={reason}
                      placeholder={t("transfer.declineReason")}
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void respond(x.caseId, false)}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void respond(x.caseId, false)}
                    >
                      {t("transfer.declineSend")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                      {t("transfer.cancelForm")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {readOnly && <p className="text-xs text-muted-foreground">{t("transfer.readOnly")}</p>}
        </>
      )}
      {declined.length > 0 && (
        <>
          <h2 className="text-sm font-semibold">{t("transfer.outgoingTitle")}</h2>
          <ul className="space-y-1.5">
            {declined.map((c) => (
              <li
                key={c._id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="font-medium tabular-nums underline-offset-2 hover:underline"
                  onClick={() => onOpen(c._id)}
                >
                  {c.customerNumber}
                </button>
                <span className="mr-auto">
                  {t("transfer.declinedBy", {
                    name: c.transferDeclined!.byName,
                    reason: c.transferDeclined!.reason,
                  })}
                </span>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void update({ caseId: c._id, dismissDecline: true }).catch((e) =>
                        handleError(e, t("case.saveError")),
                      )
                    }
                  >
                    {t("transfer.dismiss")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
