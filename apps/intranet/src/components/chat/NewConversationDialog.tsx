"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Users, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { PersonList } from "@/components/people/PersonPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

export function NewConversationDialog({
  onCreated,
  triggerVariant = "icon",
}: {
  onCreated: (id: Id<"conversations">) => void;
  /** "icon" = the header plus button; "cta" = a labelled primary button used
   *  inside empty states. */
  triggerVariant?: "icon" | "cta";
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const me = useCurrentUser();
  const people = useQuery(api.people.users.options, {});
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const createGroup = useMutation(api.chat.createGroup);
  const handleError = useErrorHandler();

  const [open, setOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<Id<"users">>>(new Set());

  const others = people?.filter((p) => p.userId !== me._id) ?? [];

  function reset() {
    setGroupMode(false);
    setGroupName("");
    setSelected(new Set());
  }

  async function startDm(userId: Id<"users">) {
    try {
      const { conversationId } = await getOrCreateDm({ otherUserId: userId });
      setOpen(false);
      reset();
      onCreated(conversationId);
    } catch (e) {
      handleError(e);
    }
  }

  async function makeGroup() {
    if (!groupName.trim() || selected.size === 0) return;
    try {
      const { conversationId } = await createGroup({
        name: groupName.trim(),
        memberIds: [...selected],
      });
      setOpen(false);
      reset();
      onCreated(conversationId);
    } catch (e) {
      handleError(e);
    }
  }

  function toggle(id: Id<"users">) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {triggerVariant === "cta" ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("startConversationCta")}
        </Button>
      ) : (
        <Button size="icon" variant="ghost" aria-label={t("newChat")} onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" />
        </Button>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={groupMode ? t("newGroup") : t("newChat")}
        description={t("newConversationHint")}
        footer={
          groupMode && others.length > 0 ? (
            <Button onClick={makeGroup} disabled={!groupName.trim() || selected.size === 0}>
              {tc("create")}
            </Button>
          ) : undefined
        }
      >
        {others.length > 0 && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-1">
            <Button
              variant={groupMode ? "ghost" : "default"}
              size="sm"
              onClick={() => setGroupMode(false)}
            >
              {t("newChat")}
            </Button>
            <Button
              variant={groupMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setGroupMode(true)}
            >
              <Users className="mr-2 h-4 w-4" />
              {t("newGroup")}
            </Button>
          </div>
        )}

        {groupMode && others.length > 0 && (
          <Input
            placeholder={t("groupName")}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        {people !== undefined && others.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UsersRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{t("noPeople")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("noPeopleHint")}</p>
            </div>
          </div>
        ) : (
          <PersonList
            people={people === undefined ? undefined : others}
            multiple={groupMode}
            selected={groupMode ? selected : null}
            onSelect={(p) => (groupMode ? toggle(p.userId) : void startDm(p.userId))}
            autoFocus={!groupMode}
            listClassName="h-72"
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
