"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type AccessRequest = FunctionReturnType<typeof api.accessRequests.list>[number];

function RequestRow({
  r,
  isAdmin,
  highlighted,
  role,
  busy,
  onRoleChange,
  onApprove,
  onDeny,
}: {
  r: AccessRequest;
  isAdmin: boolean;
  highlighted: boolean;
  role: Role;
  busy: boolean;
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

export function AccessRequestsPanel({ isAdmin }: { isAdmin: boolean }) {
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
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("noRequests")}</p>;
  }
  return (
    <div className="space-y-2">
      {requests?.map((r) => (
        <RequestRow
          key={r._id}
          r={r}
          isAdmin={isAdmin}
          highlighted={r._id === highlightId}
          role={roles[r._id] ?? "employee"}
          busy={actingOn === r._id}
          onRoleChange={(role) => setRoles((s) => ({ ...s, [r._id]: role }))}
          onDeny={() => void onDeny(r._id)}
          onApprove={() => void onApprove(r)}
        />
      ))}
    </div>
  );
}
