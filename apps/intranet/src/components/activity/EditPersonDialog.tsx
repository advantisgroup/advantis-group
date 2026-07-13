"use client";

import { useState } from "react";

import { InfoTip } from "@/components/activity/InfoTip";
import { BrandedText } from "@/components/branding/ProviderMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { useI18n } from "@/lib/activity/i18n";

import type { GenericId } from "convex/values";

export interface EditablePerson {
  _id: GenericId<"people">;
  name: string;
  email?: string;
  employeeId?: string;
  genesysUserId?: string;
  clockodoUserId?: string;
  userId?: GenericId<"users">;
  active: boolean;
}

export type PersonPatch = Partial<{
  name: string;
  email: string;
  userId: GenericId<"users"> | null;
  employeeId: string;
  genesysUserId: string;
  clockodoUserId: string;
  active: boolean;
}>;

interface FormProps {
  person: EditablePerson;
  linkableUsers: { _id: string; name: string }[];
  onSave: (patch: PersonPatch) => void;
  onCancel: () => void;
}

/**
 * Form body, keyed by person id from the parent so switching the edited
 * person remounts it with fresh initial state instead of needing an effect
 * to reseed local state.
 */
function PersonForm({ person, linkableUsers, onSave, onCancel }: FormProps) {
  const { t } = useI18n();
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email ?? "");
  const [employeeId, setEmployeeId] = useState(person.employeeId ?? "");
  const [genesysUserId, setGenesysUserId] = useState(
    person.genesysUserId ?? ""
  );
  const [clockodoUserId, setClockodoUserId] = useState(
    person.clockodoUserId ?? ""
  );
  const [userId, setUserId] = useState<string | undefined>(
    person.userId as string | undefined
  );
  const [active, setActive] = useState(person.active);

  // Once linked to an intranet account, the Clockodo id is managed via
  // Admin → Integrations → Clockodo instead — same rule the read-only cell
  // in the roster already applies.
  const clockodoManagedElsewhere = Boolean(userId);

  function handleSave() {
    onSave({
      name: name.trim() || person.name,
      email: email.trim(),
      employeeId: employeeId.trim(),
      genesysUserId: genesysUserId.trim(),
      clockodoUserId: clockodoManagedElsewhere
        ? (person.clockodoUserId ?? "")
        : clockodoUserId.trim(),
      userId: (userId as GenericId<"users"> | undefined) ?? null,
      active,
    });
  }

  return (
    <>
      <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
        <DialogTitle className="leading-snug">{t("people.edit")}</DialogTitle>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("people.name")}
          </label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("people.email")}
          </label>
          <Input value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("people.integrationIds")}
          </p>
          <InfoTip text={t("people.idsHint")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("people.employeeId")}
            </label>
            <Input
              className="font-mono text-xs"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              <BrandedText text={t("people.genesysId")} />
            </label>
            <Input
              className="font-mono text-xs"
              value={genesysUserId}
              onChange={e => setGenesysUserId(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            <BrandedText text={t("people.clockodoId")} />
          </label>
          {clockodoManagedElsewhere ? (
            <p className="text-xs text-muted-foreground">
              {person.clockodoUserId?.trim() || "—"} ·{" "}
              {t("people.manageInIntegrations")}
            </p>
          ) : (
            <Input
              className="font-mono text-xs"
              value={clockodoUserId}
              onChange={e => setClockodoUserId(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("people.intranetUser")}
            </label>
            <InfoTip text={t("people.intranetUserHint")} />
          </div>
          <Select
            value={userId ?? "none"}
            onValueChange={v => setUserId(v === "none" ? undefined : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("people.intranetUserNone")}
              </SelectItem>
              {linkableUsers.map(u => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex w-fit items-center gap-2 pt-1 text-sm text-fg">
          <Checkbox
            checked={active}
            onCheckedChange={checked => setActive(checked === true)}
          />
          {t("people.active")}
        </label>
      </div>

      <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          {t("people.cancel")}
        </Button>
        <Button onClick={handleSave}>{t("people.save")}</Button>
      </DialogFooter>
    </>
  );
}

interface Props {
  person: EditablePerson | null;
  linkableUsers: { _id: string; name: string }[];
  onSave: (
    personId: GenericId<"people">,
    patch: PersonPatch
  ) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

/**
 * Editing surface for a single roster entry, opened from an "Edit" action on
 * the (now read-only) People list rather than live inline inputs — inline
 * edits on a member list made it too easy to change data by accident while
 * scanning the roster.
 */
export function EditPersonDialog({
  person,
  linkableUsers,
  onSave,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={person !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        {person && (
          <PersonForm
            key={person._id}
            person={person}
            linkableUsers={linkableUsers}
            onCancel={() => onOpenChange(false)}
            onSave={patch => {
              void onSave(person._id, patch);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
