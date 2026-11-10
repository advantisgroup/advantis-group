"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, FileJson, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type DeskId, ITEM_KINDS, type ItemKind } from "./shared";

/**
 * Imports an inventory list (JSON) in one go: storage plus one block per
 * desk. Blocks are matched to desks by the person sitting there or by the
 * desk name; the admin checks the matches before anything is written.
 *
 * File format:
 *   { "storage": [Row, …], "desks": [{ "person": "Nadine", "items": [Row, …] }] }
 *   Row = { kind, name, spec?, serialNumber?, inventoryNumber?, quantity, defective?, note? }
 */

interface Row {
  kind: ItemKind;
  name: string;
  spec?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  quantity: number;
  defective?: boolean;
  note?: string;
}

interface Block {
  person: string;
  items: Row[];
}

interface Parsed {
  storage: Row[];
  desks: Block[];
}

const SKIP = "__skip";
const CHUNK = 250;

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function readRow(raw: unknown): Row {
  if (!raw || typeof raw !== "object") throw new Error("row");
  const item = raw as Record<string, unknown>;
  const name = str(item.name);
  const quantity = Number(item.quantity ?? 1);
  if (!name || !Number.isInteger(quantity) || quantity < 1) throw new Error("row");
  return {
    kind: ITEM_KINDS.includes(item.kind as ItemKind) ? (item.kind as ItemKind) : "other",
    name,
    spec: str(item.spec),
    serialNumber: str(item.serialNumber),
    inventoryNumber: str(item.inventoryNumber),
    quantity,
    defective: item.defective === true || undefined,
    note: str(item.note),
  };
}

export function parseInventory(text: string): Parsed {
  const data = JSON.parse(text) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    storage: list(data.storage).map(readRow),
    desks: list(data.desks).map((raw) => {
      const block = raw as Record<string, unknown>;
      const person = str(block?.person);
      if (!person) throw new Error("desk");
      return { person, items: list(block.items).map(readRow) };
    }),
  };
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "Nadine" finds "Nadine Müller"; only a single clear match counts. */
export function matchDesk(
  person: string,
  desks: { _id: DeskId; name: string; userName: string | null }[],
): DeskId | null {
  const wanted = norm(person);
  const fits = (value: string | null) => {
    if (!value) return false;
    const have = norm(value);
    return have === wanted || have.startsWith(`${wanted} `) || have.split(" ").includes(wanted);
  };
  const exact = desks.filter((desk) =>
    [desk.userName, desk.name].some((v) => v && norm(v) === wanted),
  );
  if (exact.length === 1) return exact[0]._id;
  const loose = desks.filter((desk) => fits(desk.userName) || fits(desk.name));
  return loose.length === 1 ? loose[0]._id : null;
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Office");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("import.title")}
      description={t("import.description")}
      contentClassName="max-w-2xl"
    >
      {open && <ImportFlow onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  );
}

function ImportFlow({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Office");
  const handleError = useErrorHandler();
  const plan = useQuery(api.office.plan);
  const importItems = useMutation(api.office.importItems);
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const desks = plan?.desks ?? [];

  async function pick(file: File) {
    try {
      const next = parseInventory(await file.text());
      setParsed(next);
      setFileName(file.name);
      setTargets(next.desks.map((block) => matchDesk(block.person, desks) ?? SKIP));
    } catch {
      setParsed(null);
      setFileName(null);
      toast.error(t("import.readError"));
    }
  }

  const rows = parsed
    ? [
        ...parsed.storage.map((row) => ({ ...row, deskId: undefined })),
        ...parsed.desks.flatMap((block, i) =>
          targets[i] && targets[i] !== SKIP
            ? block.items.map((row) => ({ ...row, deskId: targets[i] as DeskId }))
            : [],
        ),
      ]
    : [];
  const skipped = parsed?.desks.filter((_, i) => targets[i] === SKIP).length ?? 0;
  const chosen = targets.filter((id) => id !== SKIP);
  const doubled = chosen.length !== new Set(chosen).size;

  async function run() {
    setBusy(true);
    let saved = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        saved += await importItems({ items: rows.slice(i, i + CHUNK) });
      }
      toast.success(t("import.done", { count: saved }));
      onDone();
    } catch (e) {
      handleError(e, saved ? t("import.partial", { count: saved }) : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => input.current?.click()} disabled={!plan}>
          <FileJson className="size-4" />
          {t("import.choose")}
        </Button>
        {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
      </div>

      {parsed && (
        <div className="space-y-3">
          {(plan?.inStorage ?? 0) > 0 && parsed.storage.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-[var(--warn)] p-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />
              {t("import.storageNotEmpty", { count: plan?.inStorage ?? 0 })}
            </p>
          )}
          <p className="text-sm">
            {t("import.storageRows", {
              rows: parsed.storage.length,
              count: parsed.storage.reduce((sum, row) => sum + row.quantity, 0),
            })}
          </p>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {parsed.desks.map((block, i) => {
              const target = desks.find((desk) => desk._id === targets[i]);
              return (
                <li
                  key={`${block.person}-${i}`}
                  className="grid items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_14rem]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{block.person}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("import.rows", { count: block.items.length })}
                      {target && target.items > 0 && (
                        <span className="text-[var(--warn)]">
                          {" · "}
                          {t("import.deskNotEmpty", { count: target.items })}
                        </span>
                      )}
                    </p>
                  </div>
                  <Select
                    value={targets[i]}
                    onValueChange={(value) =>
                      setTargets((prev) => prev.map((old, j) => (j === i ? value : old)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>{t("import.skip")}</SelectItem>
                      {desks.map((desk) => (
                        <SelectItem key={desk._id} value={desk._id}>
                          {desk.userName ?? desk.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
          {skipped > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("import.skipped", { count: skipped })}
            </p>
          )}
          {doubled && <p className="text-xs text-[var(--warn)]">{t("import.doubled")}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void run()} disabled={busy || rows.length === 0}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("import.run", { count: rows.length })}
        </Button>
      </div>
    </>
  );
}
