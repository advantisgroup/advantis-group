"use client";

import { useMutation, useQuery } from "convex/react";
import { Monitor } from "lucide-react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/components/providers/current-user";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { relativeTime } from "@/lib/format";

const UNASSIGNED = "__none__";

function statusVariant(status: string) {
  return status === "active"
    ? "success"
    : status === "pending"
      ? "warning"
      : "muted";
}

export default function ActivityDevicesPage() {
  const t = useTranslations("Activity");
  const tc = useTranslations("Common");
  const isAdmin = useCurrentUser().role === "admin";
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const devices = useQuery(api.activity.devices.list, {});
  const people = useQuery(api.activity.people.list, {});

  const approve = useMutation(api.activity.devices.approve);
  const disable = useMutation(api.activity.devices.disable);
  const remove = useMutation(api.activity.devices.remove);
  const link = useMutation(api.activity.devices.link);

  async function onRemove(deviceId: Id<"devices">) {
    const ok = await confirm({
      title: t("devices.remove"),
      description: t("devices.confirmRemove"),
      confirmLabel: t("devices.remove"),
      cancelLabel: tc("cancel"),
    });
    if (ok) remove({ deviceId }).catch(handleError);
  }

  const loading = devices === undefined;
  const pending = devices?.filter(d => d.status === "pending") ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("devices.title")}
        icon={<Monitor />}
      />

      {pending.length > 0 && (
        <Card className="mb-4 border-warning/40">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold">{t("devices.pending")}</p>
            <div className="space-y-2">
              {pending.map(d => (
                <div
                  key={d._id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm">
                    {d.hostname}{" "}
                    <span className="text-muted-foreground">
                      · {d.lastWindowsUser}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    onClick={() =>
                      approve({ deviceId: d._id })
                        .then(() => toast.success(t("devices.approve")))
                        .catch(handleError)
                    }
                  >
                    {t("devices.approve")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {tc("loading")}
            </p>
          ) : devices.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("devices.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("devices.hostname")}</TableHead>
                  <TableHead>{t("devices.user")}</TableHead>
                  <TableHead>{t("devices.person")}</TableHead>
                  <TableHead>{t("devices.status")}</TableHead>
                  <TableHead>{t("devices.lastSeen")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map(d => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium">{d.hostname}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.lastWindowsUser}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.personId ?? UNASSIGNED}
                        onValueChange={v =>
                          link({
                            deviceId: d._id,
                            personId:
                              v === UNASSIGNED ? null : (v as Id<"people">),
                          }).catch(handleError)
                        }
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder={t("devices.link")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>
                            {t("devices.unlink")}
                          </SelectItem>
                          {people?.map(p => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(d.status)}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(d.lastSeen)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          {d.status !== "disabled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                disable({ deviceId: d._id }).catch(handleError)
                              }
                            >
                              {t("devices.disable")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void onRemove(d._id)}
                          >
                            {t("devices.remove")}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
