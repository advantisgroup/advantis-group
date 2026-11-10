"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, PackageOpen, Pencil, Plus, QrCode, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel, SidePanelProperties, SidePanelSection } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { AiCaptureDialog } from "./AiCapture";
import { ItemMenu } from "./ItemMenu";
import {
  type DeskOption,
  HistoryDialog,
  ItemDialog,
  MoveDialog,
  PickFromStorageDialog,
} from "./OfficeDialogs";
import { type DeskId, itemDetails, KindIcon, type OfficeItem } from "./shared";

export interface Person {
  userId: Id<"users">;
  name: string;
}

export function DeskPanel({
  deskId,
  onClose,
  canEdit,
  desks,
  people,
  onPrintQr,
}: {
  deskId: DeskId | null;
  onClose: () => void;
  canEdit: boolean;
  desks: DeskOption[];
  people: Person[];
  onPrintQr: (deskId: DeskId) => void;
}) {
  const t = useTranslations("Office");
  const format = useFormatter();
  const handleError = useErrorHandler();
  const desk = useQuery(api.office.desk, deskId ? { deskId } : "skip");
  const markChecked = useMutation(api.office.markChecked);
  const [adding, setAdding] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editingDesk, setEditingDesk] = useState(false);
  const [editing, setEditing] = useState<OfficeItem | null>(null);
  const [moving, setMoving] = useState<OfficeItem | null>(null);
  const [history, setHistory] = useState<OfficeItem | null>(null);

  const accent = desk ? (desk.checkedAt ? "var(--ok)" : "var(--warn)") : undefined;

  async function finish() {
    if (!deskId) return;
    try {
      await markChecked({ deskId });
      toast.success(t("desk.markedChecked"));
    } catch (e) {
      handleError(e, t("error"));
    }
  }

  return (
    <>
      <SidePanel
        open={!!deskId}
        onOpenChange={(open) => !open && onClose()}
        title={desk?.name ?? t("deskDialog.title")}
        accent={accent}
        closeLabel={t("close")}
        header={
          <div className="pr-8">
            <p className="text-xs text-muted-foreground">{t("deskDialog.title")}</p>
            <h2 className="font-display text-xl font-bold leading-snug">{desk?.name ?? "…"}</h2>
            {desk && (
              <p className="text-sm text-muted-foreground">{desk.userName ?? t("desk.nobody")}</p>
            )}
          </div>
        }
      >
        {desk && (
          <>
            <SidePanelSection title={t("deskDialog.title")}>
              <SidePanelProperties
                rows={[
                  { label: t("desk.person"), value: desk.userName ?? t("desk.nobody") },
                  {
                    label: t("desk.checked"),
                    value: desk.checkedAt
                      ? t("desk.checkedValue", {
                          date: format.dateTime(desk.checkedAt, { dateStyle: "medium" }),
                          name: desk.checkedByName ?? "–",
                        })
                      : t("desk.notChecked"),
                  },
                  ...(desk.note ? [{ label: t("desk.note"), value: desk.note }] : []),
                ]}
              />
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingDesk(true)}>
                    <Pencil className="size-4" />
                    {t("desk.edit")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onPrintQr(desk._id)}>
                    <QrCode className="size-4" />
                    {t("desk.qr")}
                  </Button>
                </div>
              )}
            </SidePanelSection>

            <SidePanelSection
              title={t("desk.equipment")}
              action={
                canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                      <PackageOpen className="size-4" />
                      {t("desk.fromStorage")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                      <Plus className="size-4" />
                      {t("desk.addItem")}
                    </Button>
                  </div>
                )
              }
            >
              {canEdit && (
                <Button className="mb-3 w-full" onClick={() => setCapturing(true)}>
                  <Sparkles className="size-4" />
                  {t("ai.open")}
                </Button>
              )}
              {desk.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("desk.none")}</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {desk.items.map((item) => (
                    <li key={item._id} className="flex items-center gap-3 py-2">
                      <KindIcon kind={item.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {item.quantity > 1 && (
                            <span className="tabular-nums text-muted-foreground">
                              {item.quantity}×
                            </span>
                          )}
                          <span className="truncate">{item.name}</span>
                          {item.defective && (
                            <Badge variant="destructive">{t("item.defective")}</Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {itemDetails(item, t) || t(`kinds.${item.kind}`)}
                        </p>
                      </div>
                      <ItemMenu
                        item={item}
                        canEdit={canEdit}
                        onEdit={() => setEditing(item)}
                        onMove={() => setMoving(item)}
                        onHistory={() => setHistory(item)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <Button
                  className="mt-4 w-full"
                  variant={desk.checkedAt ? "outline" : "default"}
                  onClick={() => void finish()}
                >
                  <CheckCircle2 className="size-4" />
                  {t("desk.markChecked")}
                </Button>
              )}
            </SidePanelSection>
          </>
        )}
      </SidePanel>

      {desk && (
        <>
          <AiCaptureDialog
            open={capturing}
            onOpenChange={setCapturing}
            deskId={desk._id}
            placeName={desk.name}
          />
          <ItemDialog
            open={adding}
            onOpenChange={setAdding}
            deskId={desk._id}
            placeName={desk.name}
          />
          <ItemDialog
            open={!!editing}
            onOpenChange={(open) => !open && setEditing(null)}
            item={editing ?? undefined}
            placeName={desk.name}
          />
          <PickFromStorageDialog
            open={picking}
            onOpenChange={setPicking}
            deskId={desk._id}
            placeName={desk.name}
          />
          <DeskDialog
            open={editingDesk}
            onOpenChange={setEditingDesk}
            desk={desk}
            people={people}
          />
        </>
      )}
      <MoveDialog item={moving} desks={desks} onClose={() => setMoving(null)} />
      <HistoryDialog item={history} onClose={() => setHistory(null)} />
    </>
  );
}

const NOBODY = "__nobody";

function DeskDialog({
  open,
  onOpenChange,
  desk,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desk: { _id: DeskId; name: string; userId: Id<"users"> | null; note: string | null };
  people: Person[];
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t("deskDialog.title")}>
      {open && <DeskForm desk={desk} people={people} onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  );
}

function DeskForm({
  desk,
  people,
  onDone,
}: {
  desk: { _id: DeskId; name: string; userId: Id<"users"> | null; note: string | null };
  people: Person[];
  onDone: () => void;
}) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const update = useMutation(api.office.updateDesk);
  const [name, setName] = useState(desk.name);
  const [person, setPerson] = useState<string>(desk.userId ?? NOBODY);
  const [note, setNote] = useState(desk.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await update({
        deskId: desk._id,
        name,
        userId: person === NOBODY ? null : (person as Id<"users">),
        note,
      });
      onDone();
    } catch (e) {
      handleError(e, t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="office-desk-name">{t("deskDialog.name")}</Label>
        <Input id="office-desk-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("deskDialog.person")}</Label>
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOBODY}>{t("deskDialog.nobody")}</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.userId} value={p.userId}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="office-desk-note">{t("deskDialog.note")}</Label>
        <Textarea
          id="office-desk-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void save()} disabled={busy || !name.trim()}>
          {t("save")}
        </Button>
      </div>
    </>
  );
}
