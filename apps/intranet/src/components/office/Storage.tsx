"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesSearch } from "@/lib/format";

import { ItemMenu } from "./ItemMenu";
import { HistoryDialog, ItemDialog, MoveDialog } from "./OfficeDialogs";
import { itemDetails, KindIcon, type OfficeItem } from "./shared";

type Scope = "storage" | "all" | "retired";

export function Storage() {
  const t = useTranslations("Office");
  const me = useQuery(api.office.me);
  const plan = useQuery(api.office.plan);
  const [scope, setScope] = useState<Scope>("storage");
  const rows = useQuery(api.office.items, { scope });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OfficeItem | null>(null);
  const [moving, setMoving] = useState<OfficeItem | null>(null);
  const [history, setHistory] = useState<OfficeItem | null>(null);
  const canEdit = !!me?.canEdit;
  const storage = t("place.storage");

  const shown = useMemo(
    () =>
      (rows ?? []).filter((item) =>
        matchesSearch(
          search,
          item.name,
          item.spec,
          item.serialNumber,
          item.inventoryNumber,
          item.deskName,
          t(`kinds.${item.kind}`),
        ),
      ),
    [rows, search, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CountTabs<Scope>
          value={scope}
          onChange={setScope}
          tabs={[
            { value: "storage", label: t("storage.scope.storage") },
            { value: "all", label: t("storage.scope.all") },
            { value: "retired", label: t("storage.scope.retired") },
          ]}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("storage.search")}
          className="w-full sm:ml-auto sm:w-64"
        />
        {canEdit && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            {t("storage.add")}
          </Button>
        )}
      </div>

      {rows === undefined ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={t("storage.empty")}
          description={scope === "storage" ? t("storage.intro") : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t("storage.col.name")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("storage.col.details")}</TableHead>
                <TableHead className="text-right">{t("storage.col.quantity")}</TableHead>
                {scope !== "storage" && <TableHead>{t("storage.col.place")}</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((item) => (
                <TableRow key={item._id}>
                  <TableCell title={t(`kinds.${item.kind}`)}>
                    <KindIcon kind={item.kind} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      {item.name}
                      {item.defective && <Badge variant="destructive">{t("item.defective")}</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {itemDetails(item, t) || t(`kinds.${item.kind}`)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {itemDetails(item, t) || t(`kinds.${item.kind}`)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  {scope !== "storage" && (
                    <TableCell className="text-sm">
                      {item.deskName ?? (scope === "retired" ? "–" : storage)}
                    </TableCell>
                  )}
                  <TableCell>
                    <ItemMenu
                      item={item}
                      canEdit={canEdit}
                      onEdit={() => setEditing(item)}
                      onMove={() => setMoving(item)}
                      onHistory={() => setHistory(item)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemDialog open={adding} onOpenChange={setAdding} placeName={storage} />
      <ItemDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        item={editing ?? undefined}
        placeName={storage}
      />
      <MoveDialog item={moving} desks={plan?.desks ?? []} onClose={() => setMoving(null)} />
      <HistoryDialog item={history} onClose={() => setHistory(null)} />
    </div>
  );
}
