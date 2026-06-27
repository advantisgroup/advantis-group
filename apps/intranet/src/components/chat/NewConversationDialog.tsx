"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Users } from "lucide-react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { initials } from "@/lib/format";

export function NewConversationDialog({
  onCreated,
}: {
  onCreated: (id: Id<"conversations">) => void;
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const me = useCurrentUser();
  const people = useQuery(api.users.list, {});
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const createGroup = useMutation(api.chat.createGroup);

  const [open, setOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const others = people?.filter(p => p._id !== me._id) ?? [];

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
      toast.error(e instanceof Error ? e.message : "Error");
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
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t("newChat")}>
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{groupMode ? t("newGroup") : t("newChat")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <Button
            variant={groupMode ? "outline" : "default"}
            size="sm"
            onClick={() => setGroupMode(false)}
          >
            {t("newChat")}
          </Button>
          <Button
            variant={groupMode ? "default" : "outline"}
            size="sm"
            onClick={() => setGroupMode(true)}
          >
            <Users className="mr-2 h-4 w-4" />
            {t("newGroup")}
          </Button>
        </div>

        {groupMode && (
          <Input
            placeholder={t("groupName")}
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
          />
        )}

        <ScrollArea className="h-72 rounded-md border">
          {others.map(p => (
            <div
              key={p._id}
              className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
            >
              {groupMode && (
                <Checkbox
                  checked={selected.has(p._id)}
                  onCheckedChange={() => toggle(p._id)}
                />
              )}
              <Avatar className="h-8 w-8">
                {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                <AvatarFallback className="text-xs">
                  {initials(p.name, p.email)}
                </AvatarFallback>
              </Avatar>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => (groupMode ? toggle(p._id) : startDm(p._id))}
              >
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.jobTitle || p.email}
                </p>
              </button>
            </div>
          ))}
        </ScrollArea>

        {groupMode && (
          <DialogFooter>
            <Button
              onClick={makeGroup}
              disabled={!groupName.trim() || selected.size === 0}
            >
              {tc("create")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
