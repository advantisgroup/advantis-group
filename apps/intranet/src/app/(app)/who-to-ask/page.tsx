"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Mail, Pencil, Phone, Plus, ShieldPlus, Trash2, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ContactActions } from "@/components/directory/ContactActions";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { PersonChip, PersonPicker } from "@/components/people/PersonPicker";
import { PersonLink } from "@/components/profile/PersonLink";
import { StatusMessage } from "@/components/profile/StatusMessage";
import { useIsAdmin } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";

type Contact = FunctionReturnType<typeof api.org.contacts.list>[number];
type Section = Contact["section"];

/**
 * Who to go to for what — IT, payroll, first aid, the emergency number — kept
 * by admins. The directory says who everyone is; this says who to ask.
 */
export default function WhoToAskPage() {
  const t = useTranslations("WhoToAsk");
  const isAdmin = useIsAdmin();
  const contacts = useQuery(api.org.contacts.list);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);

  const sections: Section[] = ["help", "safety"];

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={<Users />}
        action={
          isAdmin ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus />
              {t("add")}
            </Button>
          ) : undefined
        }
      />
      {contacts === undefined ? (
        <SkeletonRows rows={4} />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t("emptyTitle")}
          description={isAdmin ? t("emptyHintAdmin") : t("emptyHint")}
          action={
            isAdmin ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus />
                {t("add")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href="/directory">{t("openDirectory")}</Link>
              </Button>
            )
          }
        />
      ) : (
        sections.map((section) => {
          const rows = contacts.filter((c) => c.section === section);
          if (rows.length === 0) return null;
          return (
            <section key={section} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {section === "safety" && <ShieldPlus className="size-4" />}
                {t(`section.${section}`)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((contact) => (
                  <ContactCard
                    key={contact._id}
                    contact={contact}
                    onEdit={isAdmin ? () => setEditing(contact) : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
      {isAdmin && (
        <ContactDialog
          key={editing === null ? "closed" : editing === "new" ? "new" : editing._id}
          contact={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ContactCard({ contact, onEdit }: { contact: Contact; onEdit?: () => void }) {
  const t = useTranslations("WhoToAsk");
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight tracking-tight">{contact.topic}</h3>
          {contact.note && <p className="mt-1 text-sm text-muted-foreground">{contact.note}</p>}
        </div>
        {onEdit && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("edit", { topic: contact.topic })}
            className="text-muted-foreground"
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        )}
      </div>
      {contact.people.length > 0 && (
        <ul className="space-y-2.5">
          {contact.people.map((person) => (
            <li key={person.userId} className="flex items-center gap-2.5">
              <Avatar className="size-8 shrink-0">
                {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
                <AvatarFallback className="text-xs">
                  {initials(person.name, person.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <PersonLink userId={person.userId} className="block text-sm font-medium">
                  {person.name}
                </PersonLink>
                {person.jobTitle && (
                  <p className="truncate text-xs text-muted-foreground">{person.jobTitle}</p>
                )}
                <StatusMessage status={person.statusMessage} compact className="mt-0.5" />
              </div>
              <ContactActions email={person.email} phone={person.phone} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
      {(contact.phone || contact.email) && (
        <div className="flex flex-wrap gap-2">
          {contact.phone && (
            <a
              href={`tel:${contact.phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Phone className="size-3.5" />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function ContactDialog({
  contact,
  onClose,
}: {
  contact: Contact | "new" | null;
  onClose: () => void;
}) {
  const t = useTranslations("WhoToAsk");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const create = useMutation(api.org.contacts.create);
  const update = useMutation(api.org.contacts.update);
  const remove = useMutation(api.org.contacts.remove);
  const options = useQuery(api.people.users.options, contact ? {} : "skip");
  const existing = contact && contact !== "new" ? contact : null;

  const [section, setSection] = useState<Section>(existing?.section ?? "help");
  const [topic, setTopic] = useState(existing?.topic ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [userIds, setUserIds] = useState<Id<"users">[]>(
    existing?.people.map((p) => p.userId) ?? [],
  );
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [busy, setBusy] = useState(false);

  const canSave = topic.trim() !== "" && (userIds.length > 0 || phone.trim() || email.trim());

  async function save() {
    setBusy(true);
    try {
      const args = {
        section,
        topic,
        note: note || undefined,
        userIds,
        phone: phone || undefined,
        email: email || undefined,
      };
      if (existing) await update({ id: existing._id, ...args });
      else await create(args);
      toast.success(t("saved"));
      onClose();
    } catch (e) {
      handleError(e, t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!existing) return;
    const ok = await confirm({
      title: t("removeConfirm", { topic: existing.topic }),
      confirmLabel: tc("delete"),
    });
    if (!ok) return;
    try {
      await remove({ id: existing._id });
      toast.success(t("removed"));
      onClose();
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <ResponsiveDialog
      open={contact !== null}
      onOpenChange={(open) => !open && onClose()}
      title={existing ? t("editTitle") : t("addTitle")}
      description={t("dialogHint")}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => void onRemove()}
            >
              <Trash2 />
              {tc("delete")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={busy || !canSave} onClick={() => void save()}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("fieldSection")}>
          <Select value={section} onValueChange={(v) => setSection(v as Section)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="help">{t("section.help")}</SelectItem>
              <SelectItem value="safety">{t("section.safety")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("fieldTopic")}>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("fieldTopicPlaceholder")}
          />
        </Field>
        <Field label={t("fieldNote")}>
          <Textarea
            value={note}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("fieldNotePlaceholder")}
          />
        </Field>
        <Field label={t("fieldPeople")}>
          <div className="space-y-2">
            {userIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {userIds.map((id) => {
                  const person = options?.find((o) => o.userId === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1">
                      {person ? <PersonChip person={person} /> : null}
                      <button
                        type="button"
                        aria-label={t("removePerson", { name: person?.name ?? "" })}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => setUserIds((ids) => ids.filter((x) => x !== id))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <PersonPicker
              value={null}
              onChange={(id) => id && setUserIds((ids) => [...ids, id as Id<"users">])}
              exclude={userIds}
              placeholder={t("addPerson")}
              label={t("fieldPeople")}
            />
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fieldPhone")}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t("fieldEmail")}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
