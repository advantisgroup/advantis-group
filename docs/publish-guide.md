# Publishing an Update

"Updates" are the intranet's global banner + `/updates` feed: incidents,
scheduled maintenance, and changelog entries. Every publish path — the
`/updates/new` UI page, and the script below — funnels into the same Convex
mutation (`updates.create` / `updates.publishFromMarkdown`), so the result is
identical either way: the yellow banner, an in-app notification, and
(unless turned off) a company-wide email with Resend open/click tracking.

See [writing-good-updates.md](./writing-good-updates.md) for guidance on what
makes a good title/summary/body and which type to pick.

## Option 1: the UI

Sign in as an admin, go to `/updates`, click **New update**. Full form:
type, title, summary, body (rich text or markdown), affected systems,
audience, publish-now-or-schedule, and the "email everyone" toggle.

## Option 2: a markdown file (scriptable, agent-friendly)

This is the path for Claude Code (or anyone) to publish a changelog entry
without touching the UI.

1. Write a markdown file with frontmatter, anywhere — `content/updates/` is
   the convention (see `content/updates/example-changelog.md`):

   ```md
   ---
   type: changelog
   slug: 2026-07-uploads-speed
   title: Faster file uploads
   summary: Uploads to Files/OneDrive are now up to 3x faster.
   audience: all
   sendEmail: true
   ---

   Full write-up in markdown goes here.
   ```

2. Publish it:

   ```sh
   bun run updates:publish content/updates/2026-07-uploads-speed.md
   ```

3. Re-running the same command against the same `slug` **patches** the
   existing entry (title/summary/body/status) instead of creating a
   duplicate or re-sending the email/notification — safe to fix a typo and
   re-run.

### Frontmatter reference

| Field             | Required | Notes                                                                |
| ----------------- | -------- | -------------------------------------------------------------------- |
| `type`            | yes      | `incident` \| `maintenance` \| `changelog`                           |
| `slug`            | yes      | Stable id — re-running with the same slug patches, not duplicates.   |
| `title`           | yes      | Short, specific.                                                     |
| `summary`         | yes      | ~140 chars — this is the banner text.                                |
| `author`          | no       | Publishing user's email. Defaults to the first `ADMIN_EMAILS` entry. |
| `audience`        | no       | `all` (default) or `department:<Name>`.                              |
| `affectedSystems` | no       | YAML list, e.g. `[Files/OneDrive, Chat]`. Incident/maintenance only. |
| `status`          | no       | e.g. `investigating`, `scheduled`. Defaults per type.                |
| `startedAt`       | no       | ISO timestamp — maintenance window start. Defaults to publish time.  |
| `publishAt`       | no       | ISO timestamp — schedules instead of publishing immediately.         |
| `sendEmail`       | no       | `true` (default) or `false`.                                         |

Everything after the frontmatter is the body, rendered as GitHub-flavored
markdown on the detail page.

### Required environment

Same variables `apps/api`/`packages/convex` already use:
`CONVEX_URL` (or `NEXT_PUBLIC_CONVEX_URL`) and `CONVEX_SERVER_KEY`.

## Posting a follow-up (incidents/maintenance only)

Status updates ("investigating" → "resolved") are posted from the detail
page (`/updates/<id>`) as an admin, not from the markdown pipeline — they're
meant to be fast, in-the-moment posts. Each one appends to the timeline and
refreshes the in-app notification + banner; it does **not** send another
email (only the initial publish does, to avoid inbox spam mid-incident).
