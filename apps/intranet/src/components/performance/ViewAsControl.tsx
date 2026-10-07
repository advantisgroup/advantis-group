"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Eye, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

/**
 * "Ansicht als": lets an admin see Performance exactly as another intranet
 * user would (their dashboards, team view or only their own numbers). The
 * server swaps the viewer for every read while it runs; writes and uploads
 * keep the admin's own rights. Ends via the chip, or by itself after 8 h.
 */
export function ViewAsControl({ className }: { className?: string }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const handleError = useErrorHandler();
  const { me } = usePerformanceAccess();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = useQuery(
    api.performance.access.viewAsOptions,
    me?.canViewAs && open ? {} : "skip",
  );
  const setViewAs = useMutation(api.performance.access.setViewAs);

  if (!me?.canViewAs) return null;

  async function choose(userId: Id<"users"> | null) {
    try {
      await setViewAs({ userId });
      setOpen(false);
      setSearch("");
      // The new viewer may not have the page that's open (e.g. no team view).
      router.push("/performance");
    } catch (err) {
      handleError(err);
    }
  }

  if (me.viewingAs) {
    return (
      <div
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-warn/40 bg-warn/12 pl-2.5 pr-1 text-sm",
          className,
        )}
      >
        <Eye className="h-4 w-4 shrink-0 text-warn" aria-hidden />
        <span className="truncate">{t("viewAsActive", { name: me.viewingAs.name })}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          onClick={() => void choose(null)}
          aria-label={t("viewAsEnd")}
          title={t("viewAsEnd")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = (options ?? []).filter((o) => !query || o.name.toLowerCase().includes(query));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 shrink-0 text-muted-foreground", className)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {t("viewAs")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">{t("viewAsHint")}</p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("viewAsSearch")}
          className="mb-2 h-8"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto">
          {options === undefined ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{t("viewAsNone")}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.userId}
                type="button"
                onClick={() => void choose(o.userId)}
                className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="text-sm font-medium">{o.name}</span>
                <span className="text-xs text-muted-foreground">
                  {o.isAdmin
                    ? t("viewAsAdmin")
                    : o.dashboards
                        .map((d) =>
                          t(d.team ? "viewAsTeam" : d.own ? "viewAsOwn" : "viewAsNothing", {
                            dashboard: d.name,
                          }),
                        )
                        .join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
