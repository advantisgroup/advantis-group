"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTime } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";

/** Append-only audit log of privileged actions (IT admin). Settings hub tab. */
export function AuditPanel() {
  const { t, lang } = useI18n();
  const rows = useQuery(api.activity.audit.list, {});

  if (rows === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("audit.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("audit.when")}</TableHead>
            <TableHead>{t("audit.actor")}</TableHead>
            <TableHead>{t("audit.action")}</TableHead>
            <TableHead>{t("audit.target")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r._id}>
              <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                {formatTime(r.at, lang)}
              </TableCell>
              <TableCell className="text-fg">{r.actorName}</TableCell>
              <TableCell>
                <Badge variant="muted" className="font-mono">
                  {r.action}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {r.target ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
