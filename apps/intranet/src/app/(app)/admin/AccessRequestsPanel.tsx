"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Role } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useErrorHandler } from "@/hooks/use-error-handler";

export function AccessRequestsPanel({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const requests = useQuery(api.accessRequests.list, { status: "pending" });
  const approve = useMutation(api.accessRequests.approve);
  const deny = useMutation(api.accessRequests.deny);
  const handleError = useErrorHandler();
  const [roles, setRoles] = useState<Record<string, Role>>({});

  if (requests && requests.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noRequests")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {requests?.map(r => (
        <Card nested key={r._id}>
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{r.name ?? r.email}</p>
              <p className="text-xs text-muted-foreground">{r.email}</p>
              {r.message && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RoleSelect
                value={roles[r._id] ?? "employee"}
                onChange={role => setRoles(s => ({ ...s, [r._id]: role }))}
                canElevate={isAdmin}
              />
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => deny({ requestId: r._id }).catch(handleError)}
              >
                {t("deny")}
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() =>
                  approve({
                    requestId: r._id,
                    role: roles[r._id] ?? "employee",
                  })
                    .then(() => toast.success(t("approve")))
                    .catch(handleError)
                }
              >
                {t("approve")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
