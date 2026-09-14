"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { type Draft } from "./use-draft";

type SharedPerson = FunctionReturnType<
  typeof api.drafts.listVersions
>["versions"][number]["sharedWith"][number];

export interface ShareTarget {
  /** Null shares what's in the form now. */
  versionId: Id<"draftVersions"> | null;
  /** "14:32" or "Tuesday 12 September, 14:32". */
  when: string;
}

const NOBODY: SharedPerson[] = [];

function PersonAvatar({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  return (
    <Avatar className="size-8">
      {avatar && <AvatarImage src={avatar} alt={name} />}
      <AvatarFallback className="text-xs">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}

/** Picks the colleagues who get to read one version of a draft. */
export function ShareVersionDialog({
  draft,
  target,
  onOpenChange,
}: {
  draft: Draft;
  target: ShareTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Compose");
  const tc = useTranslations("Common");
  const me = useCurrentUser();
  const handleError = useErrorHandler();
  const people = useQuery(api.users.list, target ? {} : "skip");
  const history = useQuery(
    api.drafts.listVersions,
    target?.versionId ? { surface: draft.surface, subjectKey: draft.subjectKey } : "skip",
  );
  const unshare = useMutation(api.draftShares.unshare);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<Id<"users">>>(new Set());
  const [busy, setBusy] = useState(false);

  const sharedWith =
    history?.versions.find((version) => version._id === target?.versionId)?.sharedWith ?? NOBODY;
  const already = useMemo(() => new Set(sharedWith.map((person) => person._id)), [sharedWith]);
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (people ?? []).filter(
      (person) =>
        person._id !== me._id &&
        !already.has(person._id) &&
        (!query ||
          person.name.toLowerCase().includes(query) ||
          person.email.toLowerCase().includes(query) ||
          person.jobTitle?.toLowerCase().includes(query)),
    );
  }, [people, search, me._id, already]);

  function close() {
    onOpenChange(false);
    setSearch("");
    setSelected(new Set());
  }

  function toggle(id: Id<"users">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function share() {
    if (!target || selected.size === 0) return;
    const chosen = (people ?? []).filter((person) => selected.has(person._id));
    const first = chosen[0]?.name.split(" ")[0] ?? "";
    setBusy(true);
    try {
      const versionId = await draft.shareVersion(
        target.versionId,
        [...selected],
        t("shareDefaultName", { name: first, others: chosen.length - 1 }),
      );
      close();
      toast.success(t("shareDone", { name: first, others: chosen.length - 1 }), {
        description: t("shareDoneBody"),
        action: {
          label: t("shareCopyLink"),
          onClick: () =>
            void navigator.clipboard.writeText(
              `${window.location.origin}/drafts/shared/${versionId}`,
            ),
        },
      });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={target !== null}
      onOpenChange={(open) => (open ? onOpenChange(true) : close())}
      title={t("shareTitle")}
      description={t("shareBody", { time: target?.when ?? "" })}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button disabled={busy || selected.size === 0} onClick={() => void share()}>
            {selected.size === 0
              ? t("shareConfirmEmpty")
              : t("shareConfirm", { count: selected.size })}
          </Button>
        </>
      }
    >
      {target?.versionId && sharedWith.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("shareHasAccess")}</h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
            {sharedWith.map((person) => (
              <li key={person._id} className="flex items-center gap-3 px-3 py-2">
                <PersonAvatar {...person} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {person.name}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void unshare({ versionId: target.versionId!, userId: person._id })
                      .then(() => toast.success(t("shareRemoved", { name: person.name })))
                      .catch(handleError)
                  }
                >
                  {t("shareRemove")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("shareSearch")}
            className="pl-8"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto rounded-xl border border-border/70">
          {candidates.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {people === undefined ? "…" : t("shareNoPeople")}
            </li>
          ) : (
            candidates.map((person) => {
              const checked = selected.has(person._id);
              return (
                <li key={person._id} className="border-b border-border/60 last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggle(person._id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60",
                      checked && "bg-accent/60",
                    )}
                  >
                    <PersonAvatar {...person} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.jobTitle || person.email}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        checked
                          ? "border-foreground bg-foreground text-background"
                          : "border-border",
                      )}
                    >
                      {checked && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("shareFootnote")}</p>
      </section>
    </ResponsiveDialog>
  );
}
