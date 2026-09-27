"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PersonAvatar, PersonList } from "@/components/people/PersonPicker";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";

import { type Draft } from "./use-draft";

type SharedPerson = FunctionReturnType<
  typeof api.drafts.drafts.listVersions
>["versions"][number]["sharedWith"][number];

export interface ShareTarget {
  /** Null shares what's in the form now. */
  versionId: Id<"draftVersions"> | null;
  /** "14:32" or "Tuesday 12 September, 14:32". */
  when: string;
}

const NOBODY: SharedPerson[] = [];

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
  const people = useQuery(api.people.users.options, target ? {} : "skip");
  const history = useQuery(
    api.drafts.drafts.listVersions,
    target?.versionId ? { surface: draft.surface, subjectKey: draft.subjectKey } : "skip",
  );
  const unshare = useMutation(api.drafts.shares.unshare);
  const [selected, setSelected] = useState<Set<Id<"users">>>(new Set());
  const [busy, setBusy] = useState(false);

  const sharedWith =
    history?.versions.find((version) => version._id === target?.versionId)?.sharedWith ?? NOBODY;
  const already = useMemo(() => new Set(sharedWith.map((person) => person._id)), [sharedWith]);
  const candidates = useMemo(
    () => people?.filter((person) => person.userId !== me._id && !already.has(person.userId)),
    [people, me._id, already],
  );

  function close() {
    onOpenChange(false);
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
    const chosen = (people ?? []).filter((person) => selected.has(person.userId));
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
                <PersonAvatar person={{ ...person, avatarUrl: person.avatar }} />
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
        <PersonList
          people={candidates}
          multiple
          selected={selected}
          onSelect={(person) => toggle(person.userId)}
          autoFocus
          listClassName="max-h-64"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">{t("shareFootnote")}</p>
      </section>
    </ResponsiveDialog>
  );
}
