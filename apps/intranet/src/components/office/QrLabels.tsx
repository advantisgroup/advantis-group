"use client";

import { useEffect, useState } from "react";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

import { PrintSheet, PrintTitle } from "@/components/print/PrintSheet";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

import { type DeskId, deskUrl } from "./shared";

interface LabelDesk {
  _id: DeskId;
  name: string;
  userName: string | null;
}

/** Stickers for the desks: each QR opens that desk in the intranet, so the
 *  inventory round is "scan, record, next desk". */
export function QrLabelsDialog({
  desks,
  onClose,
}: {
  /** Null = closed. */
  desks: LabelDesk[] | null;
  onClose: () => void;
}) {
  const t = useTranslations("Office");
  const [codes, setCodes] = useState<Map<string, string> | null>(null);

  // Keyed on the ids, not the array: the plan re-renders on every live update
  // and would otherwise redraw every code each time.
  const ids = desks?.map((desk) => desk._id).join(",") ?? null;
  useEffect(() => {
    if (!ids) return setCodes(null);
    let cancelled = false;
    void Promise.all(
      ids.split(",").map(
        async (id) =>
          [
            id,
            await QRCode.toString(deskUrl(id), {
              type: "svg",
              margin: 0,
              errorCorrectionLevel: "M",
            }),
          ] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) setCodes(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const ready = !!desks && !!codes && desks.every((desk) => codes.has(desk._id));

  return (
    <ResponsiveDialog
      open={!!desks}
      onOpenChange={(open) => !open && onClose()}
      title={t("qr.dialogTitle")}
      description={t("qr.dialogDescription")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          <Button onClick={() => window.print()} disabled={!ready}>
            <Printer className="size-4" />
            {t("qr.print")}
          </Button>
        </div>
      }
    >
      {desks && (
        <p className="text-sm">
          {desks.length === 1 ? desks[0].name : t("qr.all", { count: desks.length })}
        </p>
      )}
      {ready && (
        <PrintSheet
          title={t("qr.title")}
          area={t("qr.area")}
          kind={t("qr.kind")}
          notice={t("qr.notice")}
        >
          <PrintTitle title={t("qr.title")} />
          <div className="grid grid-cols-3 gap-[4mm]">
            {desks.map((desk) => (
              <div
                key={desk._id}
                className="flex break-inside-avoid flex-col items-center rounded-[2mm] border border-foreground/30 p-[4mm] text-center"
              >
                <div
                  className="size-[38mm] [&>svg]:size-full"
                  // Generated locally by `qrcode` from our own URL, not user input.
                  dangerouslySetInnerHTML={{ __html: codes.get(desk._id) ?? "" }}
                />
                <p className="mt-[2mm] text-[14pt] font-bold leading-tight">{desk.name}</p>
                {desk.userName && <p className="text-[9pt] leading-tight">{desk.userName}</p>}
                <p className="mt-[1mm] text-[7pt] text-muted-foreground">{t("qr.scan")}</p>
              </div>
            ))}
          </div>
        </PrintSheet>
      )}
    </ResponsiveDialog>
  );
}
