"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

export function SecurityPreferencesCard() {
  const t = useTranslations("Settings");
  const { getToken } = useAuth();
  const preference = useQuery(api.stepUp.securityPreference);
  const setPreference = useMutation(api.stepUp.setSecurityPreference);
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const apiRequest = useCallback(
    async (path: string): Promise<Response> => {
      const token = await getToken();
      return await fetch(`${apiUrl}${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    },
    [getToken],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest("/passkeys");
        if (!response.ok) return;
        const body = (await response.json()) as { passkeys: unknown[] };
        if (!cancelled) setHasPasskey(body.passkeys.length > 0);
      } catch {
        // Best-effort — the warning just stays hidden if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  async function toggle(checked: boolean) {
    setSaving(true);
    try {
      await setPreference({ alwaysRequireMfaAtSignIn: checked });
      toast.success(checked ? t("securityAlwaysMfaEnabled") : t("securityAlwaysMfaDisabled"));
    } catch {
      toast.error(t("securityPreferenceError"));
    } finally {
      setSaving(false);
    }
  }

  const checked = preference?.alwaysRequireMfaAtSignIn === true;

  return (
    <Card id="security-preferences" data-hash-anchor>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold tracking-tight">{t("securityAlwaysMfa")}</p>
            <p className="text-sm text-muted-foreground">{t("securityAlwaysMfaHint")}</p>
          </div>
          <Switch
            checked={checked}
            disabled={preference === undefined || saving}
            onCheckedChange={(value) => void toggle(value)}
          />
        </div>

        {checked && hasPasskey && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
            {t("securityAlwaysMfaPasskeyWarning")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
