"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useRelativeTime } from "./use-relative-time";

function Ago({ ms }: { ms: number }) {
  return <>{useRelativeTime(ms)}</>;
}

/** The conversation on a shared draft version — the author and everyone it's
 *  shared with see the same thread. */
export function DraftComments({
  versionId,
  className,
}: {
  versionId: Id<"draftVersions">;
  className?: string;
}) {
  const t = useTranslations("Compose");
  const handleError = useErrorHandler();
  const comments = useQuery(api.drafts.shares.listComments, { versionId });
  const addComment = useMutation(api.drafts.shares.addComment);
  const deleteComment = useMutation(api.drafts.shares.deleteComment);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await addComment({ versionId, body });
      setBody("");
    } catch (error) {
      handleError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {comments && comments.length > 0 && (
        <ol className="space-y-3">
          {comments.map((comment) => (
            <li key={comment._id} className="group flex gap-2.5">
              <Avatar className="size-7">
                {comment.author?.avatar && (
                  <AvatarImage src={comment.author.avatar} alt={comment.author.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {initials(comment.author?.name, comment.author?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 text-xs">
                  <span className="font-medium">{comment.author?.name ?? t("commentsGone")}</span>
                  <span className="text-muted-foreground">
                    <Ago ms={comment.createdAt} />
                  </span>
                  {comment.mine && (
                    <button
                      type="button"
                      aria-label={t("commentsDelete")}
                      onClick={() =>
                        void deleteComment({ commentId: comment._id }).catch(handleError)
                      }
                      className="ml-auto grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={body}
          rows={2}
          maxLength={4000}
          placeholder={comments?.length ? t("commentsReplyPlaceholder") : t("commentsPlaceholder")}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          className="min-h-[60px] resize-none"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={sending || !body.trim()}>
            {t("commentsSend")}
          </Button>
        </div>
      </form>
    </div>
  );
}
