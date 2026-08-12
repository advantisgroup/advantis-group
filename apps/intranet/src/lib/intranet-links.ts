const INTRANET_HOSTNAME = "intern.advantisgroup.de";

const PATH_LABELS: Record<string, string> = {
  activity: "ActivityTrack",
  announcements: "Announcements",
  calendar: "Calendar",
  chat: "Chat",
  files: "Files",
  settings: "Settings",
  updates: "Updates",
};

function readablePart(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function headingAnchor(value: string): string {
  const anchor = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return anchor || "section";
}

export function intranetLinkLabel(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.hostname !== INTRANET_HOSTNAME) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const page = parts.map((part) => PATH_LABELS[part] ?? readablePart(part)).join(" › ");
    const section = url.hash ? readablePart(decodeURIComponent(url.hash.slice(1))) : "";
    return [page || "Intranet", section].filter(Boolean).join(" › ");
  } catch {
    return null;
  }
}
