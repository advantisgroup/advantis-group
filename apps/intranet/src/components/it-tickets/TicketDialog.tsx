"use client";

import { type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FormDialog } from "@/components/compose/FormDialog";
import { StatusBadge, ticketNumber } from "@/components/it-tickets/shared";
import { Link } from "@/components/Link";
import { useDraft } from "@/components/compose/use-draft";
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
/** Another surface (e.g. a chat message) hands its text to a new ticket here. */
export const TICKET_PREFILL_KEY = "itTickets:prefillInfo";
const SF_CATEGORY = "SF";

type TicketDoc = Doc<"itTickets">;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

interface TicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { _id: Id<"itTicketCategories">; name: string }[];
  /** Present when editing an existing ticket, absent when creating one. */
  ticket?: TicketDoc;
}

interface TicketValues {
  category: string;
  date: string;
  createdByName: string;
  status: TicketDoc["status"];
  topicChoice: string;
  topicFree: string;
  camId: string;
  custNo: string;
  info: string;
}

const isTopicPreset = (v: string): v is (typeof TOPIC_PRESETS)[number] =>
  (TOPIC_PRESETS as readonly string[]).includes(v);

function initialValues(
  ticket: TicketDoc | undefined,
  categories: TicketDialogProps["categories"],
): TicketValues {
  return {
    category: ticket?.category ?? categories[0]?.name ?? "",
    date: ticket?.date ?? isoToday(),
    createdByName: ticket?.createdByName ?? "",
    status: ticket?.status ?? "offen",
    topicChoice:
      ticket?.topic && isTopicPreset(ticket.topic)
        ? ticket.topic
        : ticket?.topic
          ? FREE_TOPIC
          : TOPIC_PRESETS[0],
    topicFree: ticket?.topic && !isTopicPreset(ticket.topic) ? ticket.topic : "",
    camId: ticket?.camId ?? "",
    custNo: ticket?.custNo ?? "",
    info: ticket?.info ?? "",
  };
}

function TicketForm({ open, onOpenChange, categories, ticket }: TicketDialogProps) {
  const t = useTranslations("ItTickets");
  const createTicket = useMutation(api.itTickets.create);
  const updateTicket = useMutation(api.itTickets.update);
  const handleError = useErrorHandler();

  const [values, setValues] = useState<TicketValues>(() => {
    const initial = initialValues(ticket, categories);
    if (ticket) return initial;
    try {
      const info = sessionStorage.getItem(TICKET_PREFILL_KEY);
      if (!info) return initial;
      sessionStorage.removeItem(TICKET_PREFILL_KEY);
      return { ...initial, info };
    } catch {
      return initial;
    }
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TicketValues>(key: K, value: TicketValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const draft = useDraft<TicketValues>({
    surface: "itTicket",
    subjectKey: ticket?._id ?? "new",
    value: values,
    restore: ticket ? "offer" : "auto",
    entitySavedAt: ticket?.updatedAt,
    isEmpty: (v) =>
      !ticket &&
      !v.createdByName.trim() &&
      !v.info.trim() &&
      !v.camId.trim() &&
      !v.custNo.trim() &&
      !v.topicFree.trim(),
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  const isSF = values.category === SF_CATEGORY;
  const isFreeTopic = values.topicChoice === FREE_TOPIC;
  const [similarText, setSimilarText] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSimilarText(values.info.trim()), 400);
    return () => clearTimeout(id);
  }, [values.info]);
  const similarTopic = isSF ? (isFreeTopic ? values.topicFree.trim() : values.topicChoice) : "";
  const similar = useQuery(
    api.itTickets.similar,
    !ticket && values.category && similarText.length >= 8
      ? { category: values.category, topic: similarTopic || undefined, text: similarText }
      : "skip",
  );

  async function save() {
    const topic = isSF ? (isFreeTopic ? values.topicFree.trim() : values.topicChoice) : undefined;
    const payload = {
      category: values.category,
      date: values.date,
      createdByName: values.createdByName.trim(),
      status: values.status,
      topic,
      camId: isSF ? values.camId.trim() : undefined,
      custNo: isSF ? values.custNo.trim() : undefined,
      info: values.info.trim(),
    };
    setBusy(true);
    try {
      if (ticket) await updateTicket({ ticketId: ticket._id, ...payload });
      else await createTicket(payload);
      await draft.clear();
      toast.success(ticket ? t("ticketUpdated", { nr: ticket.nr }) : t("ticketCreated"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ticket ? t("editTicket", { nr: ticket.nr }) : t("newTicket")}
      contentClassName="max-w-lg"
      draft={draft}
      onStartOver={() => {
        const fresh = initialValues(ticket, categories);
        setValues(fresh);
        void draft.clear(fresh);
      }}
      checks={[
        { key: "category", label: t("category"), done: !!values.category },
        { key: "createdBy", label: t("createdBy"), done: !!values.createdByName.trim() },
        ...(isSF && isFreeTopic
          ? [{ key: "topic", label: t("topicFreitextLabel"), done: !!values.topicFree.trim() }]
          : []),
        { key: "info", label: t("info"), done: !!values.info.trim(), optional: true },
      ]}
      submitLabel={ticket ? t("saveChanges") : t("save")}
      onSubmit={() => void save()}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel>{t("category")}</FieldLabel>
          <Select value={values.category} onValueChange={(v) => set("category", v)}>
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
          <Input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("createdBy")}</FieldLabel>
          <Input
            value={values.createdByName}
            onChange={(e) => set("createdByName", e.target.value)}
            placeholder={t("createdByPlaceholder")}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("status")}</FieldLabel>
          <Select
            value={values.status}
            onValueChange={(v) => set("status", v as TicketDoc["status"])}
          >
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
        <div className="rounded-xl bg-muted/50 p-3.5">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
            {t("sfDetails")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel>{t("topic")}</FieldLabel>
              <Select value={values.topicChoice} onValueChange={(v) => set("topicChoice", v)}>
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
                  value={values.topicFree}
                  onChange={(e) => set("topicFree", e.target.value)}
                  placeholder={t("topicFreitextPlaceholder")}
                />
              </label>
            )}
            <label className="space-y-1.5">
              <FieldLabel>{t("camId")}</FieldLabel>
              <Input value={values.camId} onChange={(e) => set("camId", e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <FieldLabel>{t("custNo")}</FieldLabel>
              <Input value={values.custNo} onChange={(e) => set("custNo", e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <label className="space-y-1.5">
        <FieldLabel>{t("info")}</FieldLabel>
        <Textarea
          value={values.info}
          onChange={(e) => set("info", e.target.value)}
          placeholder={t("infoPlaceholder")}
        />
      </label>

      {similar && similar.length > 0 && (
        <div className="rounded-xl border border-border/70 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("similarTickets")}</p>
          <ul className="space-y-1">
            {similar.map((s) => (
              <li key={s._id}>
                <Link
                  href={`/it-tickets?ticket=${s._id}`}
                  target="_blank"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/60"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {ticketNumber(s.nr)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.topic || s.info}</span>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormDialog>
  );
}

export function TicketDialog(props: TicketDialogProps) {
  // Mounted only while open, so each opening starts from the ticket's current
  // values (edit), a stored draft, or a blank form — never stale local state.
  if (!props.open) return null;
  return <TicketForm {...props} />;
}
