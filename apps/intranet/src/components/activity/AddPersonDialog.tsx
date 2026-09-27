"use client";

import { useState, type FormEvent } from "react";

import { InfoTip } from "@/components/activity/InfoTip";
import { PersonPicker } from "@/components/people/PersonPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useI18n } from "@/lib/activity/i18n";

import type { Id } from "@advantis/convex/dataModel";

export interface NewPerson {
  name: string;
  email?: string;
  userId?: Id<"users">;
}

/**
 * Adds someone to the ActivityTrack roster. Picking their intranet account
 * first fills in name and email and links the two, so the roster doesn't grow
 * a second, hand-typed copy of people the directory already knows. A typed
 * name alone still works for someone without an account.
 */
export function AddPersonDialog({
  open,
  onOpenChange,
  onAdd,
  linkedUserIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves truthy once the person is saved; the dialog then closes. */
  onAdd: (person: NewPerson) => Promise<unknown>;
  /** Accounts already on the roster, left out of the picker. */
  linkedUserIds: readonly (string | undefined)[];
}) {
  const { t } = useI18n();
  const [userId, setUserId] = useState<Id<"users"> | undefined>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setUserId(undefined);
      setName("");
      setEmail("");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await onAdd({
        name: name.trim(),
        email: email.trim() || undefined,
        userId,
      });
      if (created) close(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t("people.add")}
      description={t("people.addHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {t("people.cancel")}
          </Button>
          <Button type="submit" form="add-person-form" disabled={!name.trim() || saving}>
            {t("people.add")}
          </Button>
        </>
      }
    >
      <form id="add-person-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("people.intranetUser")}
            </label>
            <InfoTip text={t("people.intranetUserHint")} />
          </div>
          <PersonPicker
            value={userId ?? null}
            onChange={(id, person) => {
              setUserId(id ?? undefined);
              if (person) {
                setName(person.name);
                setEmail(person.email);
              }
            }}
            exclude={linkedUserIds}
            label={t("people.intranetUser")}
            noneLabel={t("people.intranetUserNone")}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="add-person-name" className="text-xs font-medium text-muted-foreground">
            {t("people.name")}
          </label>
          <Input
            id="add-person-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="add-person-email" className="text-xs font-medium text-muted-foreground">
            {t("people.email")}
          </label>
          <Input
            id="add-person-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </form>
    </ResponsiveDialog>
  );
}
