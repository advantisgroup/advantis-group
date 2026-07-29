"use client";

import { type ReactNode, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { isoToday } from "@/lib/absences";

const TOPIC_PRESETS = [
  "Customer number",
  "SEPA",
  "Credit Check",
  "CAM Check",
  "Docusign",
  "Active-not active",
  "Taxnumber",
] as const;
const FREE_TOPIC = "__free";
const SF_CATEGORY = "SF";

type TicketDoc = Doc<"itTickets">;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/** Mirrors `EntryDialogShell` in `components/applicants/EntryDialogs.tsx` — a
 * bottom sheet on mobile, a centered dialog on desktop, for the "log/create"
 * primary-action flows the house style requires to never sit inline. */
function TicketDialogShell({
  open,
  onOpenChange,
  title,
  description,
  saveLabel,
  saveDisabled,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  saveLabel: string;
  saveDisabled?: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const tc = useTranslations("Common");
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-2xl shadow-black/40 outline-none"
          >
            <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="shrink-0 border-b border-border/70 px-5 pb-3">
              <Drawer.Title className="font-display text-lg font-semibold leading-tight tracking-tight">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {children}
            </div>
            <div
              className="flex shrink-0 gap-2 border-t border-border/70 px-5 pt-3"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
              }}
            >
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button className="flex-1" disabled={saveDisabled} onClick={onSave}>
                {saveLabel}
              </Button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pr-12 pt-6">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1 leading-relaxed">{description}</DialogDescription>
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-5 pt-4">{children}</div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={saveDisabled} onClick={onSave}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { _id: Id<"itTicketCategories">; name: string }[];
  /** Present when editing an existing ticket, absent when creating one. */
  ticket?: TicketDoc;
}

function TicketForm({ open, onOpenChange, categories, ticket }: TicketDialogProps) {
  const t = useTranslations("ItTickets");
  const createTicket = useMutation(api.itTickets.create);
  const updateTicket = useMutation(api.itTickets.update);
  const handleError = useErrorHandler();

  const [category, setCategory] = useState(ticket?.category ?? categories[0]?.name ?? "");
  const [date, setDate] = useState(ticket?.date ?? isoToday());
  const [createdByName, setCreatedByName] = useState(ticket?.createdByName ?? "");
  const [status, setStatus] = useState<TicketDoc["status"]>(ticket?.status ?? "offen");
  const isTopicPreset = (v: string): v is (typeof TOPIC_PRESETS)[number] =>
    (TOPIC_PRESETS as readonly string[]).includes(v);
  const [topicChoice, setTopicChoice] = useState<string>(
    ticket?.topic && isTopicPreset(ticket.topic)
      ? ticket.topic
      : ticket?.topic
        ? FREE_TOPIC
        : TOPIC_PRESETS[0],
  );
  const [topicFree, setTopicFree] = useState(
    ticket?.topic && !isTopicPreset(ticket.topic) ? ticket.topic : "",
  );
  const [camId, setCamId] = useState(ticket?.camId ?? "");
  const [custNo, setCustNo] = useState(ticket?.custNo ?? "");
  const [info, setInfo] = useState(ticket?.info ?? "");

  const isSF = category === SF_CATEGORY;
  const isFreeTopic = topicChoice === FREE_TOPIC;

  function save() {
    if (!category) {
      toast.error(t("selectCategory"));
      return;
    }
    if (!createdByName.trim()) {
      toast.error(t("createdByRequired"));
      return;
    }
    const topic = isSF ? (isFreeTopic ? topicFree.trim() : topicChoice) : undefined;
    if (isSF && isFreeTopic && !topic) {
      toast.error(t("topicFreitextRequired"));
      return;
    }
    const payload = {
      category,
      date,
      createdByName: createdByName.trim(),
      status,
      topic,
      camId: isSF ? camId.trim() : undefined,
      custNo: isSF ? custNo.trim() : undefined,
      info: info.trim(),
    };
    const request = ticket
      ? updateTicket({ ticketId: ticket._id, ...payload })
      : createTicket(payload);
    request
      .then(() => {
        toast.success(ticket ? t("ticketUpdated", { nr: ticket.nr }) : t("ticketCreated"));
        onOpenChange(false);
      })
      .catch(handleError);
  }

  return (
    <TicketDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={ticket ? t("editTicket", { nr: ticket.nr }) : t("newTicket")}
      saveLabel={ticket ? t("saveChanges") : t("save")}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel>{t("category")}</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectCategory")} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("createdBy")}</FieldLabel>
          <Input
            value={createdByName}
            onChange={(e) => setCreatedByName(e.target.value)}
            placeholder={t("createdByPlaceholder")}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("status")}</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v as TicketDoc["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offen">{t("statusOffen")}</SelectItem>
              <SelectItem value="bearbeitung">{t("statusBearbeitung")}</SelectItem>
              <SelectItem value="closed">{t("statusClosed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isSF && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3.5">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
            {t("sfDetails")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel>{t("topic")}</FieldLabel>
              <Select value={topicChoice} onValueChange={setTopicChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOPIC_PRESETS.map((topicOption) => (
                    <SelectItem key={topicOption} value={topicOption}>
                      {topicOption}
                    </SelectItem>
                  ))}
                  <SelectItem value={FREE_TOPIC}>{t("topicFreitext")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isFreeTopic && (
              <label className="space-y-1.5">
                <FieldLabel>{t("topicFreitextLabel")}</FieldLabel>
                <Input
                  value={topicFree}
                  onChange={(e) => setTopicFree(e.target.value)}
                  placeholder={t("topicFreitextPlaceholder")}
                />
              </label>
            )}
            <label className="space-y-1.5">
              <FieldLabel>{t("camId")}</FieldLabel>
              <Input value={camId} onChange={(e) => setCamId(e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <FieldLabel>{t("custNo")}</FieldLabel>
              <Input value={custNo} onChange={(e) => setCustNo(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <label className="space-y-1.5">
        <FieldLabel>{t("info")}</FieldLabel>
        <Textarea
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          placeholder={t("infoPlaceholder")}
        />
      </label>
    </TicketDialogShell>
  );
}

export function TicketDialog(props: TicketDialogProps) {
  // Mounted only while open, so each opening starts from the ticket's current
  // values (edit) or a blank form (create) rather than stale local state.
  if (!props.open) return null;
  return <TicketForm {...props} />;
}
