"use client";

import { useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAuth } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, Link2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import posthog from "posthog-js";
import { toast } from "sonner";

import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { type StepMethod } from "@/components/auth/StepUpForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RequestId = Id<"passwordResetRequests">;

/** Structurally matches `StepUpHint` from `packages/convex/convex/lib/stepUp.ts`
 * — not imported directly since that module lives on the Convex build, not
 * this package's client surface. */
interface StepUpHintShape {
  needsStepUp: true;
  requiredLevel: number;
  availableMethods: StepMethod[];
}

function isStepUpHint(value: unknown): value is StepUpHintShape {
  return (
    typeof value === "object" && value !== null && (value as StepUpHintShape).needsStepUp === true
  );
}

/** Structurally matches the `needsEmailChoice` branch of
 * `issueResetLink`'s return type — the server's defense-in-depth echo of
 * what the list query already told the client via `emailChoice`. */
interface EmailChoiceHintShape {
  needsEmailChoice: true;
  feature: string;
  intranet: string;
}

function isEmailChoiceHint(value: unknown): value is EmailChoiceHintShape {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as EmailChoiceHintShape).needsEmailChoice === true
  );
}

/** Which i18n key explains an auto-approval reason — read by the hint line
 * under an auto-approved request's badges. */
const AUTO_APPROVED_HINT_KEY = {
  callerLinkedAccount: "adminAutoApprovedViaCallerLinkedAccount",
  targetLinkedAccount: "adminAutoApprovedViaTargetLinkedAccount",
  adminLinkedEmail: "adminAutoApprovedViaAdminLinkedEmail",
  verifiedSecondaryEmail: "adminAutoApprovedViaVerifiedSecondaryEmail",
} as const;

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

/**
 * Lets the admin pick which of an account's two known addresses a link
 * should go to — asked up front, before the step-up code, so the choice
 * never gets baked in silently. `feature` arrives already masked by the
 * server; `intranet` arrives in full, since an intranet account's own
 * address is already visible in the staff directory.
 */
function EmailChoiceDialog({
  open,
  feature,
  intranet,
  onChoose,
  onCancel,
}: {
  open: boolean;
  feature: string | null;
  intranet: string | null;
  onChoose: (choice: "feature" | "intranet") => void;
  onCancel: () => void;
}) {
  const t = useTranslations("PasswordReset");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("adminEmailChoiceTitle")}</DialogTitle>
          <DialogDescription>{t("adminEmailChoiceBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
            onClick={() => onChoose("feature")}
          >
            <span className="text-xs text-muted-foreground">
              {t("adminEmailChoiceFeatureLabel")}
            </span>
            <span className="break-all font-mono text-sm font-normal">{feature}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
            onClick={() => onChoose("intranet")}
          >
            <span className="text-xs text-muted-foreground">
              {t("adminEmailChoiceIntranetLabel")}
            </span>
            <span className="break-all font-mono text-sm font-normal">{intranet}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onCancel()}>
            {t("adminEmailChoiceCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { sessionId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyMethods, setVerifyMethods] = useState<StepMethod[]>(["email_code"]);
  const verifyResolver = useRef<((verified: boolean) => void) | null>(null);
  const [emailChoiceOpen, setEmailChoiceOpen] = useState(false);
  const [emailChoiceOptions, setEmailChoiceOptions] = useState<{
    feature: string | null;
    intranet: string | null;
  }>({ feature: null, intranet: null });
  const emailChoiceResolver = useRef<((choice: "feature" | "intranet" | null) => void) | null>(
    null,
  );

  // All three admin actions are wrapped: the Convex function returns a
  // `{ needsStepUp: true }` hint instead of acting when the admin hasn't
  // stepped up recently enough — see `run` below, which opens `StepUpDialog`
  // and retries exactly once.
  const issue = useAction(api.passwordResets.issueResetLink);
  const dismiss = useMutation(api.passwordResets.dismissRequest);
  const revokeLink = useMutation(api.passwordResets.revokeIssuedLink);

  const when = (at: number) =>
    format.dateTime(new Date(at), {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  function openVerification(availableMethods: StepMethod[]): Promise<boolean> {
    setVerifyMethods(availableMethods);
    setVerifyOpen(true);
    return new Promise((resolve) => {
      verifyResolver.current = resolve;
    });
  }

  function settleVerification(verified: boolean) {
    verifyResolver.current?.(verified);
    verifyResolver.current = null;
    setVerifyOpen(false);
  }

  function openEmailChoice(
    feature: string | null,
    intranet: string | null,
  ): Promise<"feature" | "intranet" | null> {
    setEmailChoiceOptions({ feature, intranet });
    setEmailChoiceOpen(true);
    return new Promise((resolve) => {
      emailChoiceResolver.current = resolve;
    });
  }

  function settleEmailChoice(choice: "feature" | "intranet" | null) {
    emailChoiceResolver.current?.(choice);
    emailChoiceResolver.current = null;
    setEmailChoiceOpen(false);
  }

  async function run(action: "issue" | "dismiss" | "revoke") {
    if (!sessionId) return;
    setBusy(true);
    try {
      if (action === "revoke") {
        let result = await revokeLink({ requestId: request.id, sessionId });
        if (isStepUpHint(result)) {
          if (!(await openVerification(result.availableMethods))) return;
          result = await revokeLink({ requestId: request.id, sessionId });
        }
        if (isStepUpHint(result)) {
          toast.error(t("adminVerifyStale"));
          posthog.capture("password_reset_admin_action_failed", { scope: request.scope, action });
          return;
        }
        toast.success(t("adminRevoked"));
      } else if (action === "issue") {
        // Asked before the step-up code, not after — the destination is
        // never something the reverification step should be able to gloss
        // over. `request.emailChoice` already carries both addresses from
        // the list query, so this needs no extra round trip. `expectedEmail`
        // is the exact string shown for whichever option gets picked — the
        // server rejects the choice if that address has changed underneath
        // it (e.g. a re-linked intranet account) by the time the step-up
        // code clears, rather than silently sending to whatever's current.
        let sendTo: "feature" | "intranet" | undefined;
        let expectedEmail: string | undefined;
        if (request.emailChoice) {
          const choice = await openEmailChoice(
            request.emailChoice.feature,
            request.emailChoice.intranet,
          );
          if (!choice) return;
          sendTo = choice;
          expectedEmail =
            choice === "feature" ? request.emailChoice.feature : request.emailChoice.intranet;
        }

        let result = await issue({ requestId: request.id, sessionId, sendTo, expectedEmail });
        if (isStepUpHint(result)) {
          if (!(await openVerification(result.availableMethods))) return;
          result = await issue({ requestId: request.id, sessionId, sendTo, expectedEmail });
        }
        if (isStepUpHint(result)) {
          toast.error(t("adminVerifyStale"));
          posthog.capture("password_reset_admin_action_failed", { scope: request.scope, action });
          return;
        }
        if (isEmailChoiceHint(result)) {
          // Either the client didn't think a choice was needed and the
          // server disagrees, or the address the admin picked has since
          // changed underneath it — either way, safer to send the admin
          // back through the (now up to date) picker than to guess here.
          toast.error(t("adminEmailChoiceStale"));
          posthog.capture("password_reset_admin_action_failed", { scope: request.scope, action });
          return;
        }
        if (!("ok" in result)) return; // exhausted every hint branch above
        toast.success(t("adminIssued", { email: result.sentTo }));
      } else {
        let result = await dismiss({ requestId: request.id, sessionId });
        if (isStepUpHint(result)) {
          if (!(await openVerification(result.availableMethods))) return;
          result = await dismiss({ requestId: request.id, sessionId });
        }
        if (isStepUpHint(result)) {
          toast.error(t("adminVerifyStale"));
          posthog.capture("password_reset_admin_action_failed", { scope: request.scope, action });
          return;
        }
        toast.success(t("adminDismissed"));
      }
      posthog.capture("password_reset_admin_action", { scope: request.scope, action });
    } catch {
      toast.error(action === "issue" ? t("adminIssueFailed") : t("adminActionFailed"));
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
          <span className="break-all font-medium">{request.targetEmailDisplay}</span>
          {request.selfService ? (
            <Badge variant="outline">{t("adminSelf")}</Badge>
          ) : request.autoApproved ? (
            <Badge variant="success">{t("adminAutoApproved")}</Badge>
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
          {request.canForceIssue ? t("adminForceHint") : t("adminUnknownAccountHint")}
        </p>
      )}
      {request.targetExists && !request.selfService && !request.autoApproved && (
        <p className="mt-3 flex items-start gap-2 text-xs text-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
          {t("adminMismatchHint")}
        </p>
      )}
      {request.autoApproved && request.autoApprovedVia && (
        <p className="mt-3 flex items-start gap-2 text-xs text-foreground">
          <Link2 className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {t(AUTO_APPROVED_HINT_KEY[request.autoApprovedVia])}
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
            {!request.targetExists && request.canForceIssue && (
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void run("issue")}
              >
                {busy ? t("adminIssuing") : t("adminForceIssue")}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("dismiss")}>
              {t("adminDismiss")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? t("adminHistoryHide") : t("adminHistory")}
            </Button>
          </div>
          {(request.targetExists || request.canForceIssue) && (
            <p className="text-xs text-muted-foreground">{t("adminLinkGoesTo")}</p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">
            {request.status === "issued" ? t("adminStatusIssued") : t("adminStatusDismissed")}
          </Badge>
          {request.linkRevoked && (
            <Badge variant="destructive">{t("adminLinkRevokedStatus")}</Badge>
          )}
          {request.handledByName && request.handledAt ? (
            <span className="break-words">
              {t("adminHandledBy", {
                name: request.handledByName,
                time: when(request.handledAt),
              })}
            </span>
          ) : (
            request.autoApproved && <span>{t("adminHandledAuto")}</span>
          )}
          {request.activeLinkExpiresAt && (
            <span>{t("adminLinkLive", { time: when(request.activeLinkExpiresAt) })}</span>
          )}
          {request.activeLinkExpiresAt && (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void run("revoke")}
            >
              {t("adminRevoke")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("adminHistoryHide") : t("adminHistory")}
          </Button>
        </div>
      )}

      {showHistory && <RequestHistory requestId={request.id} />}

      <StepUpDialog
        open={verifyOpen}
        availableMethods={verifyMethods}
        context="admin_reverify"
        onVerified={() => settleVerification(true)}
        onOpenChange={(open) => {
          if (!open) settleVerification(false);
        }}
      />
      <EmailChoiceDialog
        open={emailChoiceOpen}
        feature={emailChoiceOptions.feature}
        intranet={emailChoiceOptions.intranet}
        onChoose={(choice) => settleEmailChoice(choice)}
        onCancel={() => settleEmailChoice(null)}
      />
    </div>
  );
}

/**
 * The admin-maintained fallback `resolveTarget` consults when a mismatch
 * isn't already explained by an existing `linkedUserId` — pairs registered
 * here pre-authorize future requests between the two addresses to skip
 * manual review, so adding one goes through the same step-up gate as
 * issuing or dismissing a request.
 */
function LinkedEmailsPanel() {
  const t = useTranslations("PasswordReset");
  const format = useFormatter();
  const { sessionId } = useAuth();
  const rows = useQuery(api.passwordResets.listLinkedEmails);
  const addLink = useMutation(api.passwordResets.addLinkedEmail);
  const removeLink = useMutation(api.passwordResets.removeLinkedEmail);

  const [scope, setScope] = useState<"hr" | "performance">("performance");
  const [companySlug, setCompanySlug] = useState("");
  const [aliasEmail, setAliasEmail] = useState("");
  const [canonicalEmail, setCanonicalEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyMethods, setVerifyMethods] = useState<StepMethod[]>(["email_code"]);
  const verifyResolver = useRef<((verified: boolean) => void) | null>(null);

  function openVerification(availableMethods: StepMethod[]): Promise<boolean> {
    setVerifyMethods(availableMethods);
    setVerifyOpen(true);
    return new Promise((resolve) => {
      verifyResolver.current = resolve;
    });
  }

  function settleVerification(verified: boolean) {
    verifyResolver.current?.(verified);
    verifyResolver.current = null;
    setVerifyOpen(false);
  }

  async function handleAdd() {
    if (!sessionId || !aliasEmail || !canonicalEmail) return;
    setBusy(true);
    const payload = {
      scope,
      companySlug: scope === "performance" ? companySlug || undefined : undefined,
      aliasEmail,
      canonicalEmail,
      note: note || undefined,
      sessionId,
    };
    try {
      let result = await addLink(payload);
      if (isStepUpHint(result)) {
        if (!(await openVerification(result.availableMethods))) return;
        result = await addLink(payload);
      }
      if (isStepUpHint(result)) {
        toast.error(t("adminVerifyStale"));
        return;
      }
      toast.success(t("linkedEmailsAdded"));
      setAliasEmail("");
      setCanonicalEmail("");
      setNote("");
    } catch {
      toast.error(t("linkedEmailsAddFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: Id<"passwordResetLinkedEmails">) {
    try {
      await removeLink({ id });
      toast.success(t("linkedEmailsRemoved"));
    } catch {
      toast.error(t("adminActionFailed"));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("linkedEmailsSubtitle")}</p>

      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("linkedEmailsScope")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "hr" | "performance")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="performance">{t("areaPerformance")}</SelectItem>
                <SelectItem value="hr">{t("areaHr")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "performance" && (
            <div className="space-y-1.5">
              <Label>{t("linkedEmailsCompany")}</Label>
              <Input
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value)}
                placeholder="advantis"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("linkedEmailsAlias")}</Label>
            <Input
              type="email"
              value={aliasEmail}
              onChange={(e) => setAliasEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("linkedEmailsCanonical")}</Label>
            <Input
              type="email"
              value={canonicalEmail}
              onChange={(e) => setCanonicalEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("linkedEmailsNote")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button
          size="sm"
          disabled={busy || !aliasEmail || !canonicalEmail}
          onClick={() => void handleAdd()}
        >
          {busy ? t("linkedEmailsAdding") : t("linkedEmailsAdd")}
        </Button>
      </div>

      {rows?.length === 0 ? (
        <EmptyState icon={<Link2 />} title={t("linkedEmailsEmpty")} />
      ) : (
        <div className="space-y-2">
          {rows?.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card p-3 text-sm"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {row.scope === "hr" ? t("areaHr") : t("areaPerformance")}
                  </Badge>
                  {row.companySlug && <Badge variant="outline">{row.companySlug}</Badge>}
                </div>
                <p className="break-all">
                  <span className="font-mono">{row.aliasEmail}</span>
                  {" → "}
                  <span className="font-mono">{row.canonicalEmail}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.note && `${row.note} · `}
                  {t("linkedEmailsAddedBy", {
                    name: row.addedByName ?? "—",
                    time: format.dateTime(new Date(row.createdAt), {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  })}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void handleRemove(row.id)}>
                {t("linkedEmailsRemove")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <StepUpDialog
        open={verifyOpen}
        availableMethods={verifyMethods}
        context="admin_reverify"
        onVerified={() => settleVerification(true)}
        onOpenChange={(open) => {
          if (!open) settleVerification(false);
        }}
      />
    </div>
  );
}

export function PasswordResetsPanel() {
  const t = useTranslations("PasswordReset");
  const params = useSearchParams();
  const highlighted = params.get("request");
  const pending = useQuery(api.passwordResets.listRequests, { status: "pending" });
  const handled = useQuery(api.passwordResets.listRequests, { status: "handled" });
  const [tab, setTab] = useState("pending");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/* A full-width horizontal strip here would be a second control
          competing with the mobile bottom nav's thumb-zone space, so below
          md this collapses to a single compact Select instead. */}
      <TabsList className="hidden md:inline-flex">
        <TabsTrigger value="pending">
          {t("adminPending")}
          {pending && pending.length > 0 && (
            <Badge variant="warning" className="ml-2">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="handled">{t("adminHandled")}</TabsTrigger>
        <TabsTrigger value="linked">{t("linkedEmailsTab")}</TabsTrigger>
      </TabsList>
      <Select value={tab} onValueChange={setTab}>
        <SelectTrigger className="md:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">
            {t("adminPending")}
            {pending && pending.length > 0 ? ` (${pending.length})` : ""}
          </SelectItem>
          <SelectItem value="handled">{t("adminHandled")}</SelectItem>
          <SelectItem value="linked">{t("linkedEmailsTab")}</SelectItem>
        </SelectContent>
      </Select>

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

      <TabsContent value="linked">
        <LinkedEmailsPanel />
      </TabsContent>
    </Tabs>
  );
}
