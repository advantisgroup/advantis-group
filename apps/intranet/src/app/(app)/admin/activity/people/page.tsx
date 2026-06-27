"use client";

import { useMutation, useQuery } from "convex/react";
import { Users } from "lucide-react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";

export default function ActivityPeoplePage() {
  const t = useTranslations("Activity");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  const people = useQuery(api.activity.people.list, {});
  const create = useMutation(api.activity.people.create);
  const update = useMutation(api.activity.people.update);
  const remove = useMutation(api.activity.people.remove);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create({
        name: name.trim(),
        email: email.trim() || undefined,
        employeeId: employeeId.trim() || undefined,
      });
      toast.success(t("people.add"));
      setName("");
      setEmail("");
      setEmployeeId("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(personId: Id<"people">) {
    const ok = await confirm({
      title: t("people.remove"),
      description: tc("deleteWarning"),
      confirmLabel: t("people.remove"),
      cancelLabel: tc("cancel"),
    });
    if (ok) remove({ personId }).catch(handleError);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("people.title")}
        icon={<Users />}
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex-1 min-w-40">
            <Input
              placeholder={t("people.name")}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <Input
            type="email"
            placeholder={t("people.email")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-52"
          />
          <Input
            placeholder={t("people.employeeId")}
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className="w-36"
          />
          <Button onClick={add} disabled={busy || !name.trim()}>
            {t("people.add")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {people === undefined ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {tc("loading")}
            </p>
          ) : people.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("people.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("people.name")}</TableHead>
                  <TableHead>{t("people.email")}</TableHead>
                  <TableHead>{t("people.employeeId")}</TableHead>
                  <TableHead>{t("people.linkedUser")}</TableHead>
                  <TableHead>{t("people.active")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map(p => (
                  <TableRow key={p._id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.email ?? tc("none")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.employeeId ?? tc("none")}
                    </TableCell>
                    <TableCell>
                      {p.userId ? (
                        <Badge variant="success">✓</Badge>
                      ) : (
                        <Badge variant="muted">{tc("none")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={p.active}
                        onCheckedChange={c =>
                          update({ personId: p._id, active: !!c }).catch(
                            handleError
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onRemove(p._id)}
                      >
                        {t("people.remove")}
                      </Button>
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
