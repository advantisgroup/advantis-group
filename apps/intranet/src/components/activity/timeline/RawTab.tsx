"use client";

import { useI18n } from "@/lib/activity/i18n";
import { formatDuration, formatTime } from "@/lib/activity/fmt";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RawSample {
  _id: string;
  capturedAt: number;
  active: boolean;
  idleMs: number;
}

/** Tabular view of the most recent raw activity samples. */
export function RawTab({ samples }: { samples: RawSample[] }) {
  const { t, lang } = useI18n();
  if (samples.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">{t("timeline.empty")}</p>
    );
  }
  return (
    <Card>
      <Table aria-label={t("timeline.tabs.raw")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("timeline.time")}</TableHead>
            <TableHead>{t("timeline.state")}</TableHead>
            <TableHead>{t("timeline.idle")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {samples.map((s) => (
            <TableRow key={s._id}>
              <TableCell className="tabular-nums">
                {formatTime(s.capturedAt, lang)}
              </TableCell>
              <TableCell>
                <span className={s.active ? "text-ok" : "text-warn"}>
                  {s.active ? t("common.active") : t("common.idle")}
                </span>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatDuration(Math.floor(s.idleMs / 1000), lang)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
