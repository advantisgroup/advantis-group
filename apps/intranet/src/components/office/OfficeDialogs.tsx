"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { matchesSearch } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  type DeskId,
  ITEM_KINDS,
  type ItemKind,
  itemDetails,
  KindIcon,
  type OfficeItem,
  STORAGE,
} from "./shared";

export interface DeskOption {
  _id: DeskId;
  name: string;
  userName: string | null;
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function wholeNumber(value: string, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}

// --- Record / edit a device --------------------------------------------------

export function ItemDialog({
  open,
  onOpenChange,
  item,
  deskId,
  placeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing; otherwise a new item is recorded at `deskId` (none = storage). */
  item?: OfficeItem;
  deskId?: DeskId;
  placeName: string;
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(item ? "itemDialog.editTitle" : "itemDialog.createTitle")}
      description={item ? undefined : t("itemDialog.createAt", { place: placeName })}
      contentClassName="max-w-lg"
    >
      {open && <ItemForm item={item} deskId={deskId} onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  );
}

function ItemForm({
  item,
  deskId,
  onDone,
}: {
  item?: OfficeItem;
  deskId?: DeskId;
  onDone: () => void;
}) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const create = useMutation(api.office.createItem);
  const update = useMutation(api.office.updateItem);
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "monitor");
  const [name, setName] = useState(item?.name ?? "");
  const [spec, setSpec] = useState(item?.spec ?? "");
  const [serialNumber, setSerial] = useState(item?.serialNumber ?? "");
  const [inventoryNumber, setInventory] = useState(item?.inventoryNumber ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [defective, setDefective] = useState(item?.defective ?? false);
  const [note, setNote] = useState(item?.note ?? "");
  const [busy, setBusy] = useState(false);
  const count = wholeNumber(quantity, 9999);

  async function save(another: boolean) {
    if (!count || !name.trim()) return;
    setBusy(true);
    const fields = {
      kind,
      name,
      spec,
      serialNumber,
      inventoryNumber,
      quantity: count,
      defective,
      note,
    };
    try {
      if (item) await update({ itemId: item._id, ...fields });
      else await create({ ...fields, deskId });
      toast.success(t("itemDialog.saved"));
      if (!another) return onDone();
      // Same type of part again (the next monitor at this desk): keep the type,
      // clear what identifies the one just saved.
      setName("");
      setSerial("");
      setInventory("");
      setSpec("");
      setQuantity("1");
      setDefective(false);
      setNote("");
    } catch (e) {
      handleError(e, t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("itemDialog.kind")}>
          <Select value={kind} onValueChange={(value) => setKind(value as ItemKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  <span className="flex items-center gap-2">
                    <KindIcon kind={option} />
                    {t(`kinds.${option}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("itemDialog.quantity")} htmlFor="office-item-qty">
          <Input
            id="office-item-qty"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!count}
          />
        </Field>
        <Field label={t("itemDialog.name")} htmlFor="office-item-name" className="sm:col-span-2">
          <Input
            id="office-item-name"
            value={name}
            autoFocus
            placeholder={t("itemDialog.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("itemDialog.spec")} htmlFor="office-item-spec" className="sm:col-span-2">
          <Input
            id="office-item-spec"
            value={spec}
            placeholder={t("itemDialog.specPlaceholder")}
            onChange={(e) => setSpec(e.target.value)}
          />
        </Field>
        <Field label={t("itemDialog.serial")} htmlFor="office-item-serial">
          <Input
            id="office-item-serial"
            value={serialNumber}
            onChange={(e) => setSerial(e.target.value)}
          />
        </Field>
        <Field label={t("itemDialog.inventory")} htmlFor="office-item-inv">
          <Input
            id="office-item-inv"
            value={inventoryNumber}
            onChange={(e) => setInventory(e.target.value)}
          />
        </Field>
        <Field label={t("itemDialog.note")} htmlFor="office-item-note" className="sm:col-span-2">
          <Textarea
            id="office-item-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch id="office-item-defect" checked={defective} onCheckedChange={setDefective} />
          <Label htmlFor="office-item-defect">{t("itemDialog.defective")}</Label>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        {!item && (
          <Button
            variant="outline"
            onClick={() => void save(true)}
            disabled={busy || !count || !name.trim()}
          >
            {t("itemDialog.addAnother")}
          </Button>
        )}
        <Button onClick={() => void save(false)} disabled={busy || !count || !name.trim()}>
          {t("save")}
        </Button>
      </div>
    </>
  );
}

// --- Move to another desk or storage ----------------------------------------

export function MoveDialog({
  item,
  desks,
  onClose,
}: {
  item: OfficeItem | null;
  desks: DeskOption[];
  onClose: () => void;
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={!!item}
      onOpenChange={(open) => !open && onClose()}
      title={t("moveDialog.title")}
      description={item ? t("moveDialog.description", { name: item.name }) : undefined}
    >
      {item && <MoveForm item={item} desks={desks} onDone={onClose} />}
    </ResponsiveDialog>
  );
}

function MoveForm({
  item,
  desks,
  onDone,
}: {
  item: OfficeItem;
  desks: DeskOption[];
  onDone: () => void;
}) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const move = useMutation(api.office.moveItem);
  const [target, setTarget] = useState<string>(item.deskId ? STORAGE : (desks[0]?._id ?? STORAGE));
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [busy, setBusy] = useState(false);
  const count = wholeNumber(quantity, item.quantity);
  const unchanged = (target === STORAGE ? undefined : target) === item.deskId;

  async function submit() {
    if (!count) return;
    setBusy(true);
    try {
      await move({
        itemId: item._id,
        deskId: target === STORAGE ? null : (target as DeskId),
        quantity: count,
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
      <Field label={t("moveDialog.target")}>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STORAGE}>{t("place.storage")}</SelectItem>
            {desks.map((desk) => (
              <SelectItem key={desk._id} value={desk._id}>
                {desk.userName ? `${desk.name} · ${desk.userName}` : desk.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {item.quantity > 1 && (
        <Field label={t("moveDialog.quantity", { total: item.quantity })} htmlFor="office-move-qty">
          <Input
            id="office-move-qty"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!count}
          />
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !count || unchanged}>
          {t("item.move")}
        </Button>
      </div>
    </>
  );
}

// --- Take a part from storage to a desk -------------------------------------

export function PickFromStorageDialog({
  open,
  onOpenChange,
  deskId,
  placeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deskId: DeskId;
  placeName: string;
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pickDialog.title")}
      description={t("pickDialog.description", { place: placeName })}
      contentClassName="max-w-lg"
    >
      {open && <PickForm deskId={deskId} onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  );
}

function PickForm({ deskId, onDone }: { deskId: DeskId; onDone: () => void }) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const storage = useQuery(api.office.items, { scope: "storage" });
  const move = useMutation(api.office.moveItem);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Id<"officeItems"> | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(
    () =>
      (storage ?? []).filter((item) =>
        matchesSearch(search, item.name, item.spec, item.serialNumber, t(`kinds.${item.kind}`)),
      ),
    [storage, search, t],
  );
  const chosen = storage?.find((item) => item._id === picked);
  const count = chosen ? wholeNumber(quantity, chosen.quantity) : null;

  async function take() {
    if (!chosen || !count) return;
    setBusy(true);
    try {
      await move({ itemId: chosen._id, deskId, quantity: count });
      onDone();
    } catch (e) {
      handleError(e, t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Input
        value={search}
        placeholder={t("pickDialog.search")}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {storage !== undefined && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("pickDialog.empty")}</p>
        )}
        {rows.map((item) => (
          <button
            key={item._id}
            type="button"
            onClick={() => {
              setPicked(item._id);
              setQuantity("1");
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              picked === item._id ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
            )}
          >
            <KindIcon kind={item.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {itemDetails(item, t) || t(`kinds.${item.kind}`)}
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">{item.quantity}×</span>
          </button>
        ))}
      </div>
      {chosen && chosen.quantity > 1 && (
        <Field
          label={t("pickDialog.quantity", { total: chosen.quantity })}
          htmlFor="office-pick-qty"
        >
          <Input
            id="office-pick-qty"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!count}
          />
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void take()} disabled={busy || !count}>
          {t("pickDialog.take")}
        </Button>
      </div>
    </>
  );
}

// --- History of one item ----------------------------------------------------

export function HistoryDialog({ item, onClose }: { item: OfficeItem | null; onClose: () => void }) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={!!item}
      onOpenChange={(open) => !open && onClose()}
      title={t("history.title")}
      description={item?.name}
    >
      {item && <HistoryList itemId={item._id} />}
    </ResponsiveDialog>
  );
}

function HistoryList({ itemId }: { itemId: Id<"officeItems"> }) {
  const t = useTranslations("Office");
  const format = useFormatter();
  const rows = useQuery(api.office.itemHistory, { itemId });
  if (rows === undefined) return null;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{t("history.empty")}</p>;
  const storage = t("place.storage");
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row._id} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span>
            <span className="font-medium">{t(`history.${row.action}`)}</span>
            {row.action === "created" && (
              <span className="text-muted-foreground"> · {row.to ?? storage}</span>
            )}
            {row.action === "moved" && (
              <span className="text-muted-foreground">
                {" "}
                {t("history.route", { from: row.from ?? storage, to: row.to ?? storage })}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {format.dateTime(row.at, { dateStyle: "short", timeStyle: "short" })}
            {row.byName ? ` · ${row.byName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
