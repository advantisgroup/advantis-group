"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Star, Trash2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** The pages someone starred from their header, above the regular sections. */
export function SidebarFavorites({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const prefs = useQuery(api.people.preferences.getMine);
  const favorites = prefs?.favoritePages ?? [];
  if (favorites.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("groupFavorites")}</SidebarGroupLabel>
      <SidebarMenu>
        {favorites.map((f) => {
          const active = pathname === f.href;
          return (
            <SidebarMenuItem key={f.href}>
              <SidebarMenuButton asChild active={active} tooltip={f.label}>
                <Link href={f.href} onClick={onNavigate} aria-current={active ? "page" : undefined}>
                  <Star />
                  <SidebarLabel>{f.label}</SidebarLabel>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/**
 * The company's external tools as links that open in a new tab. Admins keep
 * the list here too, so it never needs a code change when a tool comes or
 * goes. Hidden for everyone else until there's something in it.
 */
export function SidebarTools() {
  const t = useTranslations("Nav");
  const isAdmin = useIsAdmin();
  const tools = useQuery(api.org.tools.list);
  const [editing, setEditing] = useState(false);
  if (!tools || (tools.length === 0 && !isAdmin)) return null;
  return (
    <SidebarGroup>
      <div className="flex items-center justify-between pr-2">
        <SidebarGroupLabel>{t("groupTools")}</SidebarGroupLabel>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t("toolsEdit")}
            title={t("toolsEdit")}
            className="rounded p-1 text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground group-data-[state=collapsed]/sidebar:hidden"
          >
            <Pencil className="size-3" />
          </button>
        )}
      </div>
      <SidebarMenu>
        {tools.map((tool) => (
          <SidebarMenuItem key={tool._id}>
            <SidebarMenuButton asChild tooltip={tool.description ?? tool.name}>
              <a href={tool.url} target="_blank" rel="noopener noreferrer">
                <Wrench />
                <SidebarLabel>{tool.name}</SidebarLabel>
                <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground/70 group-data-[state=collapsed]/sidebar:hidden" />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        {tools.length === 0 && (
          <li className="px-3 py-1 text-xs text-sidebar-foreground/50 group-data-[state=collapsed]/sidebar:hidden">
            {t("toolsEmptyAdmin")}
          </li>
        )}
      </SidebarMenu>
      {isAdmin && <ToolsDialog open={editing} onOpenChange={setEditing} />}
    </SidebarGroup>
  );
}

function ToolsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const tools = useQuery(api.org.tools.list, open ? {} : "skip");
  const create = useMutation(api.org.tools.create);
  const move = useMutation(api.org.tools.move);
  const remove = useMutation(api.org.tools.remove);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await create({ name, url });
      setName("");
      setUrl("");
      toast.success(t("toolAdded"));
    } catch (e) {
      handleError(e, t("toolAddFailed"));
    } finally {
      setBusy(false);
    }
  }

  function run(action: Promise<unknown>) {
    action.catch((e) => handleError(e));
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("toolsTitle")}
      description={t("toolsDescription")}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {tc("close")}
        </Button>
      }
    >
      <div className="space-y-4">
        {tools && tools.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
            {tools.map((tool, i) => (
              <li key={tool._id} className="flex items-center gap-1 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tool.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{tool.url}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  aria-label={t("toolMoveUp", { name: tool.name })}
                  onClick={() => run(move({ id: tool._id as Id<"companyTools">, direction: "up" }))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === tools.length - 1}
                  aria-label={t("toolMoveDown", { name: tool.name })}
                  onClick={() =>
                    run(move({ id: tool._id as Id<"companyTools">, direction: "down" }))
                  }
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("toolRemove", { name: tool.name })}
                  className="text-muted-foreground"
                  onClick={() => run(remove({ id: tool._id as Id<"companyTools"> }))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("toolNamePlaceholder")}
            aria-label={t("toolName")}
          />
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label={t("toolUrl")}
            />
            <Button disabled={busy || !name.trim() || !url.trim()} onClick={() => void add()}>
              {t("toolAdd")}
            </Button>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
