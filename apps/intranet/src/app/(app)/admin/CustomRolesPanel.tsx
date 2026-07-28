"use client";

import { useState, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { UserProfile } from "@/components/profile/UserProfile";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { CAPABILITY_ICONS } from "@/lib/permission-icons";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  "manage_members",
  "access_integrations",
  "manage_uploads",
  "view_activity_admin",
  "manage_announcements",
  "manage_guidebooks",
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
      <div className="space-y-4 px-6 pb-5 pt-6 sm:pr-12">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold leading-snug tracking-tight">
            {role._id ? t("edit") : t("newRole")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("descriptionDetail")}</p>
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
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1">
            {CAPABILITIES.map((cap) => {
              const checked = capabilities.includes(cap);
              const Icon = CAPABILITY_ICONS[cap];
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
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{t(`capability_${cap}`)}</p>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {t(`capability_${cap}_desc`)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          disabled={!name.trim()}
          onClick={() => onSave({ ...role, name: name.trim(), capabilities })}
        >
          {role._id ? t("save") : t("create")}
        </Button>
      </div>
    </>
  );
}

/** Same Drawer(mobile)/Dialog(desktop) shell as UserProfile — a bottom
 * sheet on small screens instead of a shrunken centered modal. RoleForm's
 * own title/description/footer are plain markup (not Radix DialogTitle
 * etc.) so they work unchanged inside either shell; each shell supplies its
 * own screen-reader-only title as required by its own primitive. */
function RoleEditorShell({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <div className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3 active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
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

  // A member can hold more than one custom role now, so they can appear in
  // more than one group's avatar stack below.
  const membersByRole = new Map<string, NonNullable<typeof members>>();
  for (const m of members ?? []) {
    for (const roleId of m.customRoleIds ?? []) {
      const list = membersByRole.get(roleId) ?? [];
      list.push(m);
      membersByRole.set(roleId, list);
    }
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
                    role.capabilities.map((cap) => {
                      const Icon = CAPABILITY_ICONS[cap];
                      return (
                        <Badge key={cap} variant="muted" className="gap-1 text-[10px]">
                          <Icon className="size-3" />
                          {t(`capability_${cap}`)}
                        </Badge>
                      );
                    })
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

      <RoleEditorShell
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?._id ? t("edit") : t("newRole")}
      >
        {editing && (
          <RoleForm
            key={editing._id ?? "new"}
            role={editing}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        )}
      </RoleEditorShell>
    </div>
  );
}
