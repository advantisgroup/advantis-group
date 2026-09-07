import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function authorInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * The byline row: avatar, author, date, read time — separated by middots.
 * Shared by the list and the article header so a post's identity reads the
 * same in both places.
 */
export function PostMeta({
  author,
  authorAvatarUrl,
  publishedAt,
  readingMinutes,
  readingLabel,
  locale,
  size = "sm",
  className,
}: {
  author: string;
  authorAvatarUrl: string | null;
  publishedAt: number;
  readingMinutes: number | null;
  /** Already-formatted "5 min read" string — pluralisation lives in i18n. */
  readingLabel: string | null;
  locale: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const date = new Date(publishedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const avatarPx = size === "md" ? 32 : 24;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground",
        size === "md" ? "text-sm" : "text-xs",
        className,
      )}
    >
      {author ? (
        <Avatar style={{ width: avatarPx, height: avatarPx }} className="border-0 bg-primary/10">
          {authorAvatarUrl ? <AvatarImage src={authorAvatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-transparent text-[10px] font-semibold text-primary">
            {authorInitials(author)}
          </AvatarFallback>
        </Avatar>
      ) : null}
      {author ? <span className="font-medium text-foreground/80">{author}</span> : null}
      {author ? <span aria-hidden>·</span> : null}
      <time dateTime={new Date(publishedAt).toISOString()}>{date}</time>
      {readingMinutes && readingLabel ? (
        <>
          <span aria-hidden>·</span>
          <span>{readingLabel}</span>
        </>
      ) : null}
    </div>
  );
}

/** Small caps category label. One accent for every category on purpose — see
 *  the note in `lib/blog-categories.ts`. */
export function CategoryEyebrow({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn("text-xs font-semibold uppercase tracking-[0.12em] text-primary", className)}
    >
      {label}
    </span>
  );
}
