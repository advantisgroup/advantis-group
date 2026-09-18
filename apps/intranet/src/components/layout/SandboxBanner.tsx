"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { Eye, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";

import { useCurrentUser } from "@/components/providers/current-user";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SandboxBanner() {
  const user = useCurrentUser();
  const leaveSandbox = useMutation(api.people.users.setSandboxRole);
  const t = useTranslations("Nav");
  const tRoles = useTranslations("Roles");
  const [leaving, setLeaving] = useState(false);

  if (!user.sandboxRole) return null;

  return (
    <Alert className="flex items-center gap-3 rounded-none border-x-0 border-t-0 border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-foreground [&>svg]:static [&>svg+div]:translate-y-0 [&>svg~*]:pl-0">
      <Eye className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {t("sandboxActive", { role: tRoles(user.sandboxRole) })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            try {
              await leaveSandbox({ role: null });
            } finally {
              setLeaving(false);
            }
          }}
        >
          <X className="size-3.5" />
          {t("exitSandbox")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
