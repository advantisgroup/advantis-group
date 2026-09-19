# Backups and retention

Three layers, each covering what the one before can't.

| Layer | What it protects against | Where it lives | Kept for |
| --- | --- | --- | --- |
| Trash | Someone deleting the wrong thing | Convex, same rows (`deletedAt`) | 30 days |
| Convex scheduled backups | A bad migration or deploy | Convex's own backup storage | Convex's setting |
| Offsite export | Losing the Convex deployment or account | OneDrive, `Backups/Convex`, encrypted | 90 days |

## Trash

Deleting an announcement, applicant, blog post, error report or measure, event,
group chat, guidebook page, IT ticket, suggestion, update, wiki entry or Sales
Coach wiki article only marks it deleted. It disappears from every read at once (the builders in
`packages/convex/convex/functions.ts` hide it), shows up under **Recently
deleted**, and whoever deleted it — or an admin — can restore it. The daily
`trash: purge` cron removes it for good after 30 days, together with what hangs
off it (read receipts, votes, attachments). See `lib/trash.ts`.

Two exceptions: a trashed applicant only shows up for people with applicant
access, even if they deleted it themselves; and a trashed group chat keeps its
members so a restore puts everyone back, but nobody can read or write in it
meanwhile. Direct messages still disappear for good.

Adding a table to the trash: give it `deletedAt`, `deletedBy` and a
`by_deletedAt` index, add it to `TRASH_TABLES`, and give `purge()` whatever
cleanup its old hard delete did. `org/trash.test.ts` fails if a table has a
`deletedAt` field that isn't covered.

Security tokens, sessions, telemetry and caches are hard-deleted on purpose.

## Applicants

Archived applicants who weren't hired are deleted, with everything recorded
about them, `APPLICANT_RETENTION_DAYS` (183) after archiving — unless they
agreed to stay in the talent pool (`hr.retention.setPoolConsent`, up to 24
months). **Confirm the 183 days with whoever handles data protection.** This
retention delete skips the trash: it's the legal deadline, not a mistake to undo.

## Convex scheduled backups (one-time setup)

Dashboard → the production deployment → **Settings → Backups** → turn on
periodic backups (daily), including file storage. This needs the Pro plan.
Nothing in the repo does this; it's a dashboard setting.

## Offsite export

`.github/workflows/convex-backup.yml` runs nightly at 03:15 UTC (and on
demand from the Actions tab):

1. `convex export --include-file-storage` from production.
2. Encrypts the zip with [age](https://age-encryption.org) to a public key.
   Only the matching private key can open it; the workflow never has it.
3. Asks apps/api for a OneDrive upload session (`/internal/backups`) and
   uploads the file in chunks straight to it. The OneDrive credentials never
   leave apps/api.
4. Deletes backups older than 90 days and records the run, which shows on the
   admin backup card. A failed run is recorded too.

### One-time setup

1. Make a key pair on a trusted machine: `age-keygen -o convex-backup-key.txt`.
   It prints the public key (`age1…`).
2. Store `convex-backup-key.txt` somewhere that survives losing everything
   else — a password manager and a printed copy. Without it the backups are
   unreadable.
3. In GitHub → Settings → Secrets and variables → Actions:
   - variable `BACKUP_AGE_RECIPIENT` = the public key
   - secret `API_URL` = the apps/api base URL
   - secret `CONVEX_SERVER_KEY` = same value apps/api uses
   - `CONVEX_DEPLOY_KEY` is already there for deploys
4. Run the workflow once by hand and check the admin backup card.

## Restore drill (quarterly)

A backup nobody has restored is a guess. Once a quarter:

1. Download the newest file from OneDrive `Backups/Convex`.
2. `age -d -i convex-backup-key.txt -o convex.zip convex-YYYY-MM-DD.zip.age`
3. Point the Convex CLI at a **dev or preview** deployment (never production)
   and run `npx convex import --replace-all convex.zip`.
4. Open that deployment's intranet, check a few announcements, a user profile,
   an attachment and an applicant document.
5. Record it on the admin backup card (**Restore test → Worked / Didn't work**).

## Deletion requests

When someone asks for their data to be erased, delete it in the intranet; the
offsite copies that still hold it age out within 90 days. If a backup is ever
restored, re-apply any deletions made since it was taken.
