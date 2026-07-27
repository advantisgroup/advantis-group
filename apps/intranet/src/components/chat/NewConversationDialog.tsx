"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Users, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";

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
  const people = useQuery(api.users.list, {});
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const createGroup = useMutation(api.chat.createGroup);
  const handleError = useErrorHandler();

  const [open, setOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const others = people?.filter((p) => p._id !== me._id) ?? [];

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
        memberIds: [...selected] as Id<"users">[],
      });
      setOpen(false);
      reset();
      onCreated(conversationId);
    } catch (e) {
      handleError(e);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {triggerVariant === "cta" ? (
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("startConversationCta")}
          </Button>
        ) : (
          <Button size="icon" variant="ghost" aria-label={t("newChat")}>
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{groupMode ? t("newGroup") : t("newChat")}</DialogTitle>
          <DialogDescription>{t("newConversationHint")}</DialogDescription>
        </DialogHeader>

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

        {others.length === 0 ? (
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
          <ScrollArea className="h-72 rounded-lg border border-border">
            {others.map((p) => (
              <div
                key={p._id}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent"
              >
                {groupMode && (
                  <Checkbox checked={selected.has(p._id)} onCheckedChange={() => toggle(p._id)} />
                )}
                <Avatar className="size-8">
                  {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                  <AvatarFallback className="text-xs">{initials(p.name, p.email)}</AvatarFallback>
                </Avatar>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => (groupMode ? toggle(p._id) : startDm(p._id))}
                >
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.jobTitle || p.email}</p>
                </button>
              </div>
            ))}
          </ScrollArea>
        )}

        {groupMode && others.length > 0 && (
          <DialogFooter>
            <Button onClick={makeGroup} disabled={!groupName.trim() || selected.size === 0}>
              {tc("create")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
