"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";

export interface OrgEntity {
  _id: string;
  name: string;
  archivedAt?: number;
  memberCount?: number;
}

function EntityRow({
  entity,
  showMemberCount,
  onRename,
  onArchiveToggle,
}: {
  entity: OrgEntity;
  showMemberCount?: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onArchiveToggle: (id: string, archived: boolean) => Promise<void>;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const [name, setName] = useState(entity.name);
  const archived = entity.archivedAt !== undefined;

  return (
    <Card className={archived ? "opacity-60" : undefined}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={name}
            disabled={archived}
            onChange={e => setName(e.target.value)}
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
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onArchiveToggle(entity._id, !archived).catch(handleError)
          }
        >
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
}: {
  entities: OrgEntity[] | undefined;
  showMemberCount?: boolean;
  createPlaceholder: string;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onArchiveToggle: (id: string, archived: boolean) => Promise<void>;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
      setNewName("");
    } catch (e) {
      handleError(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder={createPlaceholder}
          className="max-w-xs"
        />
        <Button disabled={creating || !newName.trim()} onClick={handleCreate}>
          {t("orgEntity.create")}
        </Button>
      </div>

      {entities === undefined ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dataCleanup.loading")}
        </p>
      ) : entities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("orgEntity.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {entities.map(entity => (
            <EntityRow
              key={entity._id}
              entity={entity}
              showMemberCount={showMemberCount}
              onRename={onRename}
              onArchiveToggle={onArchiveToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
