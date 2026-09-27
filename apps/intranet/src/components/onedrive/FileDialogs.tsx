"use client";

import { useEffect, useState } from "react";

import { type OneDriveItem } from "@advantis/types";
import { Check, Copy, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type OneDriveVersion, useOneDriveApi } from "@/lib/onedrive-api";
import { formatFileSize } from "@/lib/upload";

function useBusy() {
  const [busy, setBusy] = useState(false);
  return [busy, setBusy] as const;
}

// --- New folder -------------------------------------------------------------

export function NewFolderDialog({
  open,
  onOpenChange,
  path,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  path: string;
  onDone: () => void;
}) {
  const t = useTranslations("Files");
  const handleError = useErrorHandler();
  const od = useOneDriveApi();
  const [name, setName] = useState("");
  const [busy, setBusy] = useBusy();

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await od.createFolder(path, trimmed);
      toast.success(t("folderCreated"));
      onOpenChange(false);
      onDone();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("newFolder")}
      description={t("newFolderDesc")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        placeholder={t("folderName")}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
    </ResponsiveDialog>
  );
}

// --- Rename -----------------------------------------------------------------

export function RenameDialog({
  item,
  onOpenChange,
  onDone,
}: {
  item: OneDriveItem | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations("Files");
  const handleError = useErrorHandler();
  const od = useOneDriveApi();
  const [name, setName] = useState("");
  const [busy, setBusy] = useBusy();

  useEffect(() => {
    if (item) setName(item.name);
  }, [item]);

  const submit = async () => {
    if (!item) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === item.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await od.rename(item.id, trimmed);
      toast.success(t("renamed"));
      onOpenChange(false);
      onDone();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rename")}</DialogTitle>
          <DialogDescription>{t("renameDesc")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Share ------------------------------------------------------------------

const DAY_OPTIONS = [7, 30, 90];

export function ShareDialog({
  item,
  onOpenChange,
}: {
  item: OneDriveItem | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("Files");
  const handleError = useErrorHandler();
  const od = useOneDriveApi();
  const [days, setDays] = useState(7);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useBusy();

  useEffect(() => {
    if (item) {
      setUrl(null);
      setDays(7);
      setCopied(false);
    }
  }, [item]);

  const createLink = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const res = await od.share(item.id, days);
      setUrl(res.url);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("share")}</DialogTitle>
          <DialogDescription>{t("shareDesc")}</DialogDescription>
        </DialogHeader>
        {!url ? (
          <>
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">{t("expiresIn")}</span>
              <RadioGroup
                value={String(days)}
                onValueChange={(v) => setDays(Number(v))}
                className="flex gap-4"
              >
                {DAY_OPTIONS.map((d) => (
                  <div key={d} className="flex items-center gap-1.5">
                    <RadioGroupItem value={String(d)} id={`days-${d}`} />
                    <Label htmlFor={`days-${d}`} className="cursor-pointer text-sm font-normal">
                      {t("nDays", { count: d })}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button onClick={() => void createLink()} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("createLink")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Input readOnly value={url} className="flex-1" />
            <Button size="icon" variant="outline" onClick={() => void copy()}>
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Versions ---------------------------------------------------------------

export function VersionsDialog({
  item,
  canWrite,
  onOpenChange,
  onDone,
}: {
  item: OneDriveItem | null;
  canWrite: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations("Files");
  const handleError = useErrorHandler();
  const od = useOneDriveApi();
  const [versions, setVersions] = useState<OneDriveVersion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setVersions(null);
    void od
      .versions(item.id)
      .then((r) => setVersions(r.versions))
      .catch(() => setVersions([]));
  }, [item, od]);

  const restore = async (versionId: string) => {
    if (!item) return;
    setBusyId(versionId);
    try {
      await od.restoreVersion(item.id, versionId);
      toast.success(t("restored"));
      onOpenChange(false);
      onDone();
    } catch (e) {
      handleError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("versions")}</DialogTitle>
        </DialogHeader>
        {versions === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noVersions")}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {versions.map((v, i) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {v.lastModified ? new Date(v.lastModified).toLocaleString() : v.id}
                    {i === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">{t("current")}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(v.size)}
                    {v.modifiedBy ? ` · ${v.modifiedBy}` : ""}
                  </p>
                </div>
                {canWrite && i !== 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void restore(v.id)}
                    disabled={busyId === v.id}
                  >
                    {busyId === v.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    {t("restore")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
