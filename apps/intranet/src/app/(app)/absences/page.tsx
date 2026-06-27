"use client";

import { useMutation, useQuery } from "convex/react";
import { Clock, Plus } from "lucide-react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type AbsenceType } from "@advantis/types";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/lib/format";

type Status = "pending" | "approved" | "denied" | "cancelled";

function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("Absences");
  const variant = {
    pending: "warning",
    approved: "success",
    denied: "destructive",
    cancelled: "muted",
  }[status] as "warning" | "success" | "destructive" | "muted";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

function RequestDialog() {
  const t = useTranslations("Absences");
  const tc = useTranslations("Common");
  const create = useMutation(api.absences.createRequest);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AbsenceType>("vacation");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!startDate || !endDate) return;
    setBusy(true);
    try {
      await create({
        type,
        startDate,
        endDate,
        halfDay,
        reason: reason || undefined,
      });
      toast.success(t("newRequest"));
      setOpen(false);
      setReason("");
      setStart("");
      setEnd("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("newRequest")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newRequest")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("type")}</Label>
            <Select value={type} onValueChange={v => setType(v as AbsenceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">{t("vacation")}</SelectItem>
                <SelectItem value="sick">{t("sick")}</SelectItem>
                <SelectItem value="personal">{t("personal")}</SelectItem>
                <SelectItem value="other">{t("other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("start")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("end")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={halfDay}
              onCheckedChange={v => setHalfDay(!!v)}
            />
            {t("halfDay")}
          </label>
          <div className="space-y-1.5">
            <Label>
              {t("reason")}{" "}
              <span className="text-muted-foreground">({tc("optional")})</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !startDate || !endDate}>
            {tc("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyAbsences() {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const absences = useQuery(api.absences.myAbsences);
  const cancel = useMutation(api.absences.cancel);

  if (absences && absences.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("noAbsences")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {absences?.map(a => (
        <Card key={a._id}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t(a.type)}</span>
                {a.source === "clockodo" && (
                  <Badge variant="muted" className="gap-1">
                    <Clock className="h-3 w-3" /> Clockodo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatIsoDate(a.startDate, locale)} –{" "}
                {formatIsoDate(a.endDate, locale)}
                {a.halfDay ? " · ½" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              {a.source === "intranet" &&
                (a.status === "pending" || a.status === "approved") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void cancel({ absenceId: a._id })}
                  >
                    {t("cancelRequest")}
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Approvals() {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const pending = useQuery(api.absences.pendingForApproval);
  const approve = useMutation(api.absences.approve);
  const deny = useMutation(api.absences.deny);

  async function act(
    fn: typeof approve,
    absenceId: Id<"absences">,
    label: string
  ) {
    try {
      await fn({ absenceId });
      toast.success(label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  if (pending && pending.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("noPending")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {pending?.map(a => (
        <Card key={a._id}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <span className="font-medium">{a.userName}</span>
              <p className="text-sm text-muted-foreground">
                {t(a.type)} · {formatIsoDate(a.startDate, locale)} –{" "}
                {formatIsoDate(a.endDate, locale)}
              </p>
              {a.reason && (
                <p className="text-xs text-muted-foreground">{a.reason}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void act(deny, a._id, t("denied"))}
              >
                {t("deny")}
              </Button>
              <Button
                size="sm"
                onClick={() => void act(approve, a._id, t("approved"))}
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

export default function AbsencesPage() {
  const t = useTranslations("Absences");
  const isManager = useIsManager();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} action={<RequestDialog />} />
      {isManager ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">{t("myRequests")}</TabsTrigger>
            <TabsTrigger value="approvals">{t("approvals")}</TabsTrigger>
          </TabsList>
          <TabsContent value="mine">
            <MyAbsences />
          </TabsContent>
          <TabsContent value="approvals">
            <Approvals />
          </TabsContent>
        </Tabs>
      ) : (
        <MyAbsences />
      )}
    </div>
  );
}
