"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { UserProfile } from "@/components/profile/UserProfile";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  "manage_members",
  "access_integrations",
  "manage_uploads",
  "view_activity_admin",
] as const;
type Capability = (typeof CAPABILITIES)[number];

interface CustomRoleFormState {
  _id?: Id<"customRoles">;
  name: string;
  capabilities: Capability[];
}

function RoleForm({
  role,
  onCancel,
  onSave,
}: {
  role: CustomRoleFormState;
  onCancel: () => void;
  onSave: (state: CustomRoleFormState) => void;
}) {
  const t = useTranslations("CustomRoles");
  const [name, setName] = useState(role.name);
  const [capabilities, setCapabilities] = useState<Capability[]>(role.capabilities);

  function toggle(cap: Capability) {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  }

  return (
    <>
      <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
        <div className="space-y-1">
          <DialogTitle className="leading-snug">{role._id ? t("edit") : t("newRole")}</DialogTitle>
          <DialogDescription>{t("descriptionDetail")}</DialogDescription>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("name")}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("capabilities")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CAPABILITIES.map((cap) => {
              const checked = capabilities.includes(cap);
              return (
                <button
                  key={cap}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(cap)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border/70 hover:border-border",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <Check className="size-3" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{t(`capability_${cap}`)}</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-xs text-muted-foreground">
                          {t(`capability_${cap}_desc`)}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs leading-relaxed">
                        {t(`capability_${cap}_desc`)}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          disabled={!name.trim()}
          onClick={() => onSave({ ...role, name: name.trim(), capabilities })}
        >
          {role._id ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CustomRolesPanel() {
  const t = useTranslations("CustomRoles");
  const roles = useQuery(api.customRoles.list);
  const members = useQuery(api.users.list, { includeSuspended: true });
  const createRole = useMutation(api.customRoles.create);
  const updateRole = useMutation(api.customRoles.update);
  const removeRole = useMutation(api.customRoles.remove);
  const handleError = useErrorHandler();
  const confirm = useConfirm();

  const [editing, setEditing] = useState<CustomRoleFormState | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);

  const membersByRole = new Map<string, NonNullable<typeof members>>();
  for (const m of members ?? []) {
    if (!m.customRoleId) continue;
    const list = membersByRole.get(m.customRoleId) ?? [];
    list.push(m);
    membersByRole.set(m.customRoleId, list);
  }

  async function handleDelete(role: { _id: Id<"customRoles">; name: string }) {
    const ok = await confirm({
      title: t("delete"),
      description: t("deleteConfirm", { name: role.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    removeRole({ customRoleId: role._id })
      .then(() => toast.success(t("deleted")))
      .catch(handleError);
  }

  function handleSave(state: CustomRoleFormState) {
    if (state._id) {
      updateRole({
        customRoleId: state._id,
        name: state.name,
        capabilities: state.capabilities,
      })
        .then(() => toast.success(t("updated")))
        .catch(handleError);
    } else {
      createRole({ name: state.name, capabilities: state.capabilities })
        .then(() => toast.success(t("created")))
        .catch(handleError);
    }
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {t("description")}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("descriptionDetail")}
                className="inline-flex text-muted-foreground transition-colors hover:text-fg focus-visible:text-fg focus:outline-none"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-relaxed">
              {t("descriptionDetail")}
            </TooltipContent>
          </Tooltip>
        </p>
        <Button size="sm" onClick={() => setEditing({ name: "", capabilities: [] })}>
          <Plus className="size-4" />
          {t("newRole")}
        </Button>
      </div>

      {roles && roles.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <div className="space-y-2">
        {roles?.map((role) => (
          <Card nested key={role._id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{role.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {role.capabilities.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("noCapabilities")}</span>
                  ) : (
                    role.capabilities.map((cap) => (
                      <Badge key={cap} variant="muted" className="text-[10px]">
                        {t(`capability_${cap}`)}
                      </Badge>
                    ))
                  )}
                </div>
                <AvatarStack
                  className="mt-2"
                  max={6}
                  people={(membersByRole.get(role._id) ?? []).map((m) => ({
                    id: m._id,
                    name: m.name,
                    avatar: m.avatar,
                    detail: m.clerkUserId,
                  }))}
                  onSelect={(id) => setSelectedUserId(id as Id<"users">)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setEditing({
                      _id: role._id,
                      name: role.name,
                      capabilities: role.capabilities,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => void handleDelete(role)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <UserProfile
        userId={selectedUserId}
        open={!!selectedUserId}
        onOpenChange={(o) => {
          if (!o) setSelectedUserId(null);
        }}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg gap-0 p-0">
          {editing && (
            <RoleForm
              key={editing._id ?? "new"}
              role={editing}
              onCancel={() => setEditing(null)}
              onSave={handleSave}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
