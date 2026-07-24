"use client";

import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";

import { PerformanceBrandMark } from "@/components/performance/PerformanceBrandMark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Reached only via `proxy.ts`'s tenant-subdomain rewrite, when the Host
// doesn't resolve to any active company — a mistyped or stale subdomain of
// the Performance wildcard root, not a real error in the app itself.
export default function UnknownTenantPage() {
  const t = useTranslations("Performance");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <PerformanceBrandMark className="mb-4" />
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            {t("unknownTenantTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {t("unknownTenantBody")}
        </CardContent>
      </Card>
    </div>
  );
}
