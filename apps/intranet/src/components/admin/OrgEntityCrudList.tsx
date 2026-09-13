"use client";

import { useState } from "react";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

export interface OrgEntity {
  _id: string;
  name: string;
  archivedAt?: number;
  memberCount?: number;
  reportsToUserId?: string;
}

const NOBODY = "__nobody";

/** Offered when members of a team/department should report to one person. */
export interface ReportsToOptions {
  people: { _id: string; name: string }[];
  onChange: (id: string, userId: string | null) => Promise<void>;
}

function EntityRow({
  entity,
  showMemberCount,
  reportsTo,
  onRename,
  onArchiveToggle,
}: {
  entity: OrgEntity;
  showMemberCount?: boolean;
  reportsTo?: ReportsToOptions;
  onRename: (id: string, name: string) => Promise<void>;
  onArchiveToggle: (id: string, archived: boolean) => Promise<void>;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const [name, setName] = useState(entity.name);
  const archived = entity.archivedAt !== undefined;

  async function toggleArchive() {
    if (!archived) {
      const ok = await confirm({
        title: t("orgEntity.confirmArchiveTitle", { name: entity.name }),
        description: t("orgEntity.confirmArchiveBody"),
        details: [{ label: tc("fieldName"), value: entity.name }],
        confirmLabel: t("orgEntity.archive"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    onArchiveToggle(entity._id, !archived).catch(handleError);
  }

  return (
    <Card className={archived ? "opacity-60" : undefined}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={name}
            disabled={archived}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== entity.name) {
                onRename(entity._id, name.trim()).catch(handleError);
              }
            }}
            className="max-w-xs"
          />
          {showMemberCount && (
            <Badge variant="muted">
              {t("orgEntity.memberCount", { count: entity.memberCount ?? 0 })}
            </Badge>
          )}
          {archived && <Badge variant="muted">{t("orgEntity.archived")}</Badge>}
        </div>
        {reportsTo && !archived && (
          <Select
            value={entity.reportsToUserId ?? NOBODY}
            onValueChange={(value) =>
              reportsTo.onChange(entity._id, value === NOBODY ? null : value).catch(handleError)
            }
          >
            <SelectTrigger className="h-9 w-56" aria-label={t("orgEntity.reportsTo")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>{t("orgEntity.reportsToNobody")}</SelectItem>
              {reportsTo.people.map((person) => (
                <SelectItem key={person._id} value={person._id}>
                  {t("orgEntity.reportsToPerson", { name: person.name })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" onClick={() => void toggleArchive()}>
          {archived ? t("orgEntity.restore") : t("orgEntity.archive")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function OrgEntityCrudList({
  entities,
  showMemberCount,
  createPlaceholder,
  onCreate,
  onRename,
  onArchiveToggle,
  createInDialog,
  reportsTo,
}: {
  entities: OrgEntity[] | undefined;
  showMemberCount?: boolean;
  reportsTo?: ReportsToOptions;
  createPlaceholder: string;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onArchiveToggle: (id: string, archived: boolean) => Promise<void>;
  /** This list is the page's own primary content (not already nested inside
   * another dialog, e.g. `CategoryManagerDialog`) — so per house style the
   * create control moves into a page-header action + dialog instead of
   * sitting inline above the list. */
  createInDialog?: boolean;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
      setNewName("");
      setCreateOpen(false);
    } catch (e) {
      handleError(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {createInDialog ? (
        <>
          <PageHeaderActions
            actions={[
              {
                key: "create",
                label: t("orgEntity.create"),
                icon: Plus,
                onClick: () => setCreateOpen(true),
              },
            ]}
          />
          <ResponsiveDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            title={t("orgEntity.create")}
            footer={
              <Button
                disabled={creating || !newName.trim()}
                onClick={handleCreate}
                className="w-full sm:w-auto"
              >
                {t("orgEntity.create")}
              </Button>
            }
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder={createPlaceholder}
              autoFocus
            />
          </ResponsiveDialog>
        </>
      ) : (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder={createPlaceholder}
            className="max-w-xs"
          />
          <Button disabled={creating || !newName.trim()} onClick={handleCreate}>
            {t("orgEntity.create")}
          </Button>
        </div>
      )}

      {entities === undefined ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tc("loading")}</p>
      ) : entities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("orgEntity.empty")}</p>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => (
            <EntityRow
              key={entity._id}
              entity={entity}
              showMemberCount={showMemberCount}
              reportsTo={reportsTo}
              onRename={onRename}
              onArchiveToggle={onArchiveToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
