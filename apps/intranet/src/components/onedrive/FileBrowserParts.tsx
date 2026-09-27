"use client";

import { Fragment } from "react";

import { type DriveQuota, type OneDriveItem, type OneDriveListing } from "@advantis/types";
import {
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Link2,
  MoreVertical,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ariaSort, SortButton, type SortDir } from "@/components/ui/sortable-head";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Rows, tiles, menus and other pieces of `FileBrowser`. */

/** Wraps every case-insensitive occurrence of `query` in `text` with a mark. */
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-400/40">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** File-type icon. Each branch renders a concrete (static) lucide component. */
export function ItemIcon({ item, className }: { item: OneDriveItem; className?: string }) {
  const cls = cn(className, item.type === "folder" ? "text-blue-500" : "text-muted-foreground");
  if (item.type === "folder") return <Folder className={cls} />;
  const m = item.mimeType ?? "";
  if (m.startsWith("image/")) return <FileImage className={cls} />;
  if (m.includes("pdf")) return <FileText className={cls} />;
  if (m.includes("sheet") || m.includes("excel") || item.name.endsWith(".csv"))
    return <FileSpreadsheet className={cls} />;
  if (m.includes("zip") || m.includes("compressed")) return <FileArchive className={cls} />;
  if (m.includes("word") || m.includes("document")) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

export function QuotaBar({ quota }: { quota: DriveQuota }) {
  const t = useTranslations("Files");
  const pct = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;
  const pctLabel = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-2 text-xs text-muted-foreground">
            <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  pct > 90 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums">{pctLabel}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("quota", {
            used: formatFileSize(quota.used),
            total: formatFileSize(quota.total),
          })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "right";
}) {
  return (
    <th
      className={cn("px-4 py-2.5 font-medium", align === "right" && "text-right")}
      aria-sort={ariaSort(active, dir)}
    >
      <SortButton
        label={label}
        active={active}
        dir={dir}
        onClick={onClick}
        className="uppercase tracking-wide refreshed:normal-case refreshed:tracking-normal"
      />
    </th>
  );
}

// --- Sub-components ----------------------------------------------------------

export function Breadcrumbs({
  listing,
  onNavigate,
  rootPath = "",
  rootLabel,
}: {
  listing: OneDriveListing | null;
  onNavigate: (path: string) => void;
  rootPath?: string;
  rootLabel?: string;
}) {
  const allCrumbs = listing?.breadcrumbs ?? [{ id: "", name: "Advantis GmbH", path: "" }];
  // Confined instances never show anything above their own root — the
  // server-returned breadcrumb trail always starts at the AG root, so clip
  // it and relabel the root crumb instead.
  const crumbs = rootPath
    ? [
        { id: rootPath, name: rootLabel ?? rootPath, path: rootPath },
        ...allCrumbs.filter((c) => c.path !== rootPath && c.path.startsWith(`${rootPath}/`)),
      ]
    : allCrumbs;
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          <button
            type="button"
            onClick={() => onNavigate(c.path)}
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 hover:bg-accent",
              i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

export type RowActionType =
  | "download"
  | "share"
  | "rename"
  | "delete"
  | "versions"
  | "preview"
  | "copylink"
  | "favorite";

export function RowMenu({
  item,
  favorite,
  onAction,
}: {
  item: OneDriveItem;
  favorite?: boolean;
  onAction: (a: RowActionType) => void;
}) {
  const t = useTranslations("Files");
  const isFile = item.type === "file";

  const items: ActionMenuItem[] = [
    ...(isFile
      ? ([
          {
            key: "preview",
            label: t("preview"),
            icon: <FileText className="size-4" />,
            onSelect: () => onAction("preview"),
          },
          {
            key: "download",
            label: t("download"),
            icon: <Download className="size-4" />,
            onSelect: () => onAction("download"),
          },
          {
            key: "versions",
            label: t("versions"),
            icon: <RotateCcw className="size-4" />,
            onSelect: () => onAction("versions"),
          },
        ] satisfies ActionMenuItem[])
      : []),
    {
      key: "copylink",
      label: t("copyLink"),
      icon: <Copy className="size-4" />,
      onSelect: () => onAction("copylink"),
    },
    ...(item.type === "folder"
      ? ([
          {
            key: "favorite",
            label: favorite ? t("removeFavorite") : t("addFavorite"),
            icon: <Star className={cn("size-4", favorite && "fill-amber-400 text-amber-500")} />,
            onSelect: () => onAction("favorite"),
          },
        ] satisfies ActionMenuItem[])
      : []),
    ...(item.canWrite
      ? ([
          { key: "sep-write", separator: true },
          {
            key: "share",
            label: t("share"),
            icon: <Link2 className="size-4" />,
            onSelect: () => onAction("share"),
          },
          {
            key: "rename",
            label: t("rename"),
            icon: <Pencil className="size-4" />,
            onSelect: () => onAction("rename"),
          },
          {
            key: "delete",
            label: t("delete"),
            icon: <Trash2 className="size-4" />,
            onSelect: () => onAction("delete"),
            destructive: true,
          },
        ] satisfies ActionMenuItem[])
      : []),
  ];

  return (
    <ActionMenu
      ariaLabel={t("actions")}
      align="end"
      items={items}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
          <MoreVertical className="size-4" />
        </Button>
      }
    />
  );
}

export function FileRow({
  item,
  highlightQuery = "",
  focused,
  selected,
  favorite,
  onSelect,
  onOpen,
  onAction,
  onHoverIntent,
}: {
  item: OneDriveItem;
  highlightQuery?: string;
  focused?: boolean;
  selected?: boolean;
  favorite?: boolean;
  onSelect?: () => void;
  onOpen: (item: OneDriveItem) => void;
  onAction: (a: RowActionType) => void;
  onHoverIntent?: (item: OneDriveItem) => void;
}) {
  return (
    <tr
      className={cn(
        "group border-b border-border/40 last:border-0 hover:bg-accent/40",
        focused && "bg-accent/60",
        selected && "bg-primary/5 refreshed:bg-accent",
      )}
    >
      <td className="pl-3">
        <Checkbox
          aria-label={item.name}
          checked={!!selected}
          onCheckedChange={() => onSelect?.()}
        />
      </td>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => onOpen(item)}
          onMouseEnter={() => onHoverIntent?.(item)}
          onFocus={() => onHoverIntent?.(item)}
          className="flex items-center gap-2.5 text-left"
        >
          <ItemIcon item={item} className="size-4 shrink-0" />
          <span className="truncate font-medium">
            <HighlightMatch text={item.name} query={highlightQuery} />
          </span>
          {favorite && <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />}
        </button>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{item.uploadedByName ?? "—"}</td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : "—"}
      </td>
      <td className="px-4 py-2.5 text-right text-muted-foreground">
        {item.type === "file" ? formatFileSize(item.size) : "—"}
      </td>
      <td className="px-2">
        <RowMenu item={item} favorite={favorite} onAction={onAction} />
      </td>
    </tr>
  );
}

/** Grid tile: thumbnail (when Graph provides one) or a large type icon. */
export function GridTile({
  item,
  focused,
  favorite,
  onOpen,
  onAction,
  onHoverIntent,
}: {
  item: OneDriveItem;
  focused?: boolean;
  favorite?: boolean;
  onOpen: (item: OneDriveItem) => void;
  onAction: (a: RowActionType) => void;
  onHoverIntent?: (item: OneDriveItem) => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border/60 transition-colors hover:border-border hover:bg-accent/40",
        focused && "border-primary/50 bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        onMouseEnter={() => onHoverIntent?.(item)}
        onFocus={() => onHoverIntent?.(item)}
        className="flex w-full flex-col items-stretch text-left"
      >
        <span className="flex h-24 items-center justify-center overflow-hidden rounded-t-lg bg-muted/40">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <ItemIcon item={item} className="size-9" />
          )}
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
          {favorite && <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" />}
        </span>
      </button>
      <div className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <RowMenu item={item} favorite={favorite} onAction={onAction} />
      </div>
    </div>
  );
}

export function FileCard({
  item,
  highlightQuery = "",
  onOpen,
  onAction,
}: {
  item: OneDriveItem;
  highlightQuery?: string;
  onOpen: (item: OneDriveItem) => void;
  onAction: (a: RowActionType) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ItemIcon item={item} className="size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-medium">
            <HighlightMatch text={item.name} query={highlightQuery} />
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.type === "file" ? formatFileSize(item.size) : ""}
            {item.uploadedByName ? ` · ${item.uploadedByName}` : ""}
          </span>
        </span>
      </button>
      <RowMenu item={item} onAction={onAction} />
    </li>
  );
}

export function FolderEmpty({ searching }: { searching: boolean }) {
  const t = useTranslations("Files");
  return (
    <EmptyState
      inline
      className="py-16"
      icon={<Folder />}
      title={searching ? t("noResults") : t("emptyFolder")}
    />
  );
}
