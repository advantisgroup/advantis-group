"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { Check, Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type AccessRequest = FunctionReturnType<typeof api.accessRequests.list>[number];

function RequestRow({
  r,
  isAdmin,
  highlighted,
  role,
  busy,
  refreshed,
  onRoleChange,
  onApprove,
  onDeny,
}: {
  r: AccessRequest;
  isAdmin: boolean;
  highlighted: boolean;
  role: Role;
  busy: boolean;
  refreshed: boolean;
  onRoleChange: (role: Role) => void;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const t = useTranslations("Admin");
  const ref = useRef<HTMLDivElement>(null);

  // Deep link from a notification: scroll the matching request into view and
  // give it the same warm flash used elsewhere on landing.
  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  if (refreshed) {
    return (
      <div
        ref={ref}
        role="listitem"
        className={cn(
          "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center",
          highlighted && "deeplink-hl",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">{initials(r.name, r.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.name ?? r.email}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.name ? `${r.email} · ` : ""}
              {t("requestedAgo", { age: relativeTime(r.createdAt) })}
            </p>
            {r.message && (
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                {r.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <RoleSelect value={role} onChange={onRoleChange} canElevate={isAdmin} disabled={busy} />
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("deny")}
            title={t("deny")}
            disabled={busy}
            onClick={onDeny}
          >
            <X />
          </Button>
          <Button size="sm" className="max-sm:flex-1" disabled={busy} onClick={onApprove}>
            <Check />
            {t("approve")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card nested ref={ref} className={cn(highlighted && "deeplink-hl")}>
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{r.name ?? r.email}</p>
          <p className="text-xs text-muted-foreground">{r.email}</p>
          {r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoleSelect value={role} onChange={onRoleChange} canElevate={isAdmin} disabled={busy} />
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={busy}
            onClick={onDeny}
          >
            {t("deny")}
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" disabled={busy} onClick={onApprove}>
            {t("approve")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccessRequestsPanel({
  isAdmin,
  refreshed = false,
}: {
  isAdmin: boolean;
  /** The refreshed design: one hairline-divided list instead of a card per request. */
  refreshed?: boolean;
}) {
  const t = useTranslations("Admin");
  const tRoles = useTranslations("Roles");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const requests = useQuery(api.accessRequests.list, { status: "pending" });
  const approve = useMutation(api.accessRequests.approve);
  const deny = useMutation(api.accessRequests.deny);
  const handleError = useErrorHandler();
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);

  // Deep link from a notification: /admin/requests?request=<id> highlights
  // the matching pending request once the list has loaded.
  const highlightId = useDeepLinkId("request");

  async function onDeny(id: Id<"accessRequests">) {
    setActingOn(id);
    try {
      await deny({ requestId: id });
    } catch (e) {
      handleError(e);
    } finally {
      setActingOn(null);
    }
  }

  async function onApprove(r: AccessRequest) {
    const role = roles[r._id] ?? "employee";
    // Granting manager/admin is a real privilege escalation, not just letting
    // someone in — confirm before it happens instead of a single click doing it.
    if (role !== "employee") {
      const ok = await confirm({
        title: t("approveElevatedTitle"),
        description: t("approveElevatedBody", { name: r.name ?? r.email, role: tRoles(role) }),
        confirmLabel: t("approve"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    setActingOn(r._id);
    try {
      await approve({ requestId: r._id, role });
      toast.success(t("approve"));
    } catch (e) {
      handleError(e);
    } finally {
      setActingOn(null);
    }
  }

  if (requests && requests.length === 0) {
    return refreshed ? (
      <EmptyState icon={<Clock />} title={t("noRequests")} />
    ) : (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("noRequests")}</p>
    );
  }

  const rows = requests?.map((r) => (
    <RequestRow
      key={r._id}
      r={r}
      isAdmin={isAdmin}
      highlighted={r._id === highlightId}
      role={roles[r._id] ?? "employee"}
      busy={actingOn === r._id}
      refreshed={refreshed}
      onRoleChange={(role) => setRoles((s) => ({ ...s, [r._id]: role }))}
      onDeny={() => void onDeny(r._id)}
      onApprove={() => void onApprove(r)}
    />
  ));

  if (!refreshed) return <div className="space-y-2">{rows}</div>;

  return (
    <div className="space-y-3">
      {requests && (
        <p className="text-xs text-muted-foreground">
          {t("requestsWaiting", { count: requests.length })}
        </p>
      )}
      <div
        role="list"
        className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card"
      >
        {rows}
      </div>
    </div>
  );
}
