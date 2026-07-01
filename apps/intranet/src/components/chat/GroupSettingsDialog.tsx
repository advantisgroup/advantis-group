"use client";

import { useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Camera,
  Check,
  ImageOff,
  Loader2,
  LogOut,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GroupAvatar } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { isImage, uploadToConvex } from "@/lib/upload";

export function GroupSettingsDialog({
  conversationId,
  open,
  onOpenChange,
  onLeftOrDeleted,
}: {
  conversationId: Id<"conversations">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLeftOrDeleted: () => void;
}) {
  const t = useTranslations("Chat");
  const tc = useTranslations("Common");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const handleError = useErrorHandler();

  // Narrow to the "ok" shape only; if the group was deleted or the caller is
  // no longer a member, all the fields below just stay undefined — the parent
  // (ConversationView) is what actually surfaces that state to the user.
  const conversationQuery = useQuery(api.chat.getConversation, {
    conversationId,
  });
  const conversation =
    conversationQuery?.status === "ok" ? conversationQuery : undefined;
  const renameGroup = useMutation(api.chat.renameGroup);
  const setGroupAvatar = useMutation(api.chat.setGroupAvatar);
  const addGroupMembers = useMutation(api.chat.addGroupMembers);
  const removeGroupMember = useMutation(api.chat.removeGroupMember);
  const leaveConversation = useMutation(api.chat.leaveConversation);
  const deleteGroup = useMutation(api.chat.deleteGroup);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isCreator = conversation?.isCreator ?? false;
  const nameValue = name ?? conversation?.title ?? "";

  async function onSaveName() {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await renameGroup({ conversationId, name: nameValue.trim() });
      toast.success(t("saved"));
      setName(null);
    } catch (e) {
      handleError(e);
    } finally {
      setSavingName(false);
    }
  }

  async function onUploadPhoto(file: File) {
    if (!isImage(file)) {
      toast.error(t("photoMustBeImage"));
      return;
    }
    setUploading(true);
    try {
      const avatarStorageId = await uploadToConvex(
        () => generateUploadUrl({}),
        file
      );
      await setGroupAvatar({ conversationId, avatarStorageId });
      toast.success(t("saved"));
    } catch (e) {
      handleError(e);
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto() {
    try {
      await setGroupAvatar({ conversationId, avatarStorageId: undefined });
    } catch (e) {
      handleError(e);
    }
  }

  async function onAddMembers() {
    if (selected.size === 0) return;
    try {
      await addGroupMembers({
        conversationId,
        memberIds: [...selected] as Id<"users">[],
      });
      setSelected(new Set());
      setAdding(false);
    } catch (e) {
      handleError(e);
    }
  }

  async function onRemoveMember(userId: Id<"users">, memberName: string) {
    const ok = await confirm({
      title: t("removeMember"),
      description: t("removeMemberHint", { name: memberName }),
      confirmLabel: t("removeMember"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removeGroupMember({ conversationId, userId });
    } catch (e) {
      handleError(e);
    }
  }

  async function onLeave() {
    const ok = await confirm({
      title: t("leaveGroup"),
      description: t("leaveGroupHint"),
      confirmLabel: t("leaveGroup"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await leaveConversation({ conversationId });
      onOpenChange(false);
      onLeftOrDeleted();
    } catch (e) {
      handleError(e);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteGroup"),
      description: t("deleteGroupHint"),
      confirmLabel: t("deleteGroup"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await deleteGroup({ conversationId });
      onOpenChange(false);
      onLeftOrDeleted();
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("groupSettings")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">{t("tabInfo")}</TabsTrigger>
            <TabsTrigger value="members">{t("members")}</TabsTrigger>
            <TabsTrigger value="media">{t("sharedMedia")}</TabsTrigger>
          </TabsList>

          {/* Info: photo + name */}
          <TabsContent value="info" className="space-y-4 pt-2">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <GroupAvatar
                  src={conversation?.groupAvatar}
                  memberAvatars={(conversation?.members ?? [])
                    .filter(m => m._id !== me._id)
                    .map(m => m.avatar)}
                  memberNames={(conversation?.members ?? [])
                    .filter(m => m._id !== me._id)
                    .map(m => m.name)}
                  name={conversation?.title ?? "Group"}
                  className="size-20"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label={t("changePhoto")}
                  className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-background bg-blue-500 text-white shadow-sm transition-colors hover:bg-blue-600"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void onUploadPhoto(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {conversation?.groupAvatar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={onRemovePhoto}
                >
                  <ImageOff className="mr-1.5 h-4 w-4" />
                  {t("removePhoto")}
                </Button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("groupName")}
              </label>
              <div className="flex gap-2">
                <Input
                  value={nameValue}
                  onChange={e => setName(e.target.value)}
                  placeholder={t("groupName")}
                />
                <Button
                  onClick={onSaveName}
                  disabled={
                    savingName ||
                    !nameValue.trim() ||
                    nameValue.trim() === conversation?.title
                  }
                >
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onLeave}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("leaveGroup")}
              </Button>
              {isCreator && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteGroup")}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Members */}
          <TabsContent value="members" className="pt-2">
            {adding ? (
              <AddMembersPanel
                existingIds={new Set(
                  (conversation?.members ?? []).map(m => m._id)
                )}
                selected={selected}
                onToggle={id =>
                  setSelected(s => {
                    const next = new Set(s);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onCancel={() => {
                  setAdding(false);
                  setSelected(new Set());
                }}
                onConfirm={onAddMembers}
                labels={{
                  add: t("addMembers"),
                  cancel: tc("cancel"),
                  empty: t("noPeople"),
                }}
              />
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 w-full"
                  onClick={() => setAdding(true)}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  {t("addMembers")}
                </Button>
                <ScrollArea className="h-64 rounded-lg border border-border">
                  {(conversation?.members ?? []).map(m => (
                    <div
                      key={m._id}
                      className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <Avatar className="size-8">
                        {m.avatar && (
                          <AvatarImage src={m.avatar} alt={m.name} />
                        )}
                        <AvatarFallback className="text-xs">
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {m.name}
                        {m._id === me._id ? ` (${t("you")})` : ""}
                      </span>
                      {m.isCreator ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t("creator")}
                        </span>
                      ) : isCreator && m._id !== me._id ? (
                        <button
                          aria-label={t("removeMember")}
                          onClick={() => void onRemoveMember(m._id, m.name)}
                          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* Shared media */}
          <TabsContent value="media" className="pt-2">
            <SharedMedia conversationId={conversationId} emptyLabel={t("noMedia")} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersPanel({
  existingIds,
  selected,
  onToggle,
  onCancel,
  onConfirm,
  labels,
}: {
  existingIds: Set<string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  labels: { add: string; cancel: string; empty: string };
}) {
  const people = useQuery(api.users.list, {});
  const candidates = (people ?? []).filter(p => !existingIds.has(p._id));

  return (
    <div>
      <ScrollArea className="h-56 rounded-lg border border-border">
        {candidates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {labels.empty}
          </p>
        ) : (
          candidates.map(p => (
            <button
              key={p._id}
              onClick={() => onToggle(p._id)}
              className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent"
            >
              <Checkbox checked={selected.has(p._id)} />
              <Avatar className="size-8">
                {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                <AvatarFallback className="text-xs">
                  {initials(p.name, p.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.name}
              </span>
            </button>
          ))
        )}
      </ScrollArea>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1.5 h-4 w-4" />
          {labels.cancel}
        </Button>
        <Button size="sm" disabled={selected.size === 0} onClick={onConfirm}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          {labels.add}
          {selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
      </div>
    </div>
  );
}

function SharedMedia({
  conversationId,
  emptyLabel,
}: {
  conversationId: Id<"conversations">;
  emptyLabel: string;
}) {
  const t = useTranslations("Chat");
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.listSharedMedia,
    { conversationId },
    { initialNumItems: 18 }
  );

  if (results.length === 0 && status !== "LoadingFirstPage") {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {results.map(a =>
          a.kind === "image" && a.url ? (
            <a
              key={`${a.messageId}-${a.storageId}`}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-md border border-border"
            >
              <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
            </a>
          ) : a.url ? (
            <a
              key={`${a.messageId}-${a.storageId}`}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/40 p-2 text-center text-[10px] text-muted-foreground hover:bg-accent"
            >
              <span className="truncate">{a.name}</span>
            </a>
          ) : null
        )}
      </div>
      {status === "CanLoadMore" && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => loadMore(18)}>
            {t("loadMoreMedia")}
          </Button>
        </div>
      )}
    </div>
  );
}
