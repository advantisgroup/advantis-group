"use client";

import { type Doc, type Id } from "@advantis/convex/dataModel";
import {
  Armchair,
  Cable,
  Cpu,
  Headphones,
  Keyboard,
  Laptop,
  type LucideIcon,
  Monitor,
  Mouse,
  Network,
  Package,
  Phone,
  Plug,
  PlugZap,
  Printer,
  Usb,
  Webcam,
} from "lucide-react";

export type ItemKind = Doc<"officeItems">["kind"];
export type OfficeItem = Doc<"officeItems">;
export type DeskId = Id<"officeDesks">;

export const KIND_ICONS: Record<ItemKind, LucideIcon> = {
  computer: Cpu,
  laptop: Laptop,
  monitor: Monitor,
  dock: Usb,
  keyboard: Keyboard,
  mouse: Mouse,
  headset: Headphones,
  webcam: Webcam,
  phone: Phone,
  cable: Cable,
  adapter: Plug,
  power: PlugZap,
  network: Network,
  printer: Printer,
  furniture: Armchair,
  other: Package,
};

export const ITEM_KINDS = Object.keys(KIND_ICONS) as ItemKind[];

export function KindIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={className ?? "size-4 text-muted-foreground"} aria-hidden />;
}

export const STORAGE = "__storage";

/** The link a desk's QR label opens. */
export function deskUrl(deskId: string) {
  return `${window.location.origin}/office?platz=${deskId}`;
}

export function itemDetails(
  item: Pick<OfficeItem, "spec" | "serialNumber" | "inventoryNumber">,
  t: (key: "item.serial" | "item.inventory", values: { value: string }) => string,
) {
  return [
    item.spec,
    item.serialNumber && t("item.serial", { value: item.serialNumber }),
    item.inventoryNumber && t("item.inventory", { value: item.inventoryNumber }),
  ]
    .filter(Boolean)
    .join(" · ");
}
