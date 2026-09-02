# Whitepaper download (marketing `/whitepaper`)

Lead capture for the free whitepaper on AI tools in sales. A dedicated page —
not a popup — with the company's own contact details, a short description, a
form for the visitor's details, and an explicit consent checkbox. The document
is mailed out under a **double opt-in**: the form only ever earns a
confirmation mail, and the whitepaper itself is sent once that link is opened.

## The loop

1. `GET /{locale}/whitepaper` — `app/[locale]/(pages)/whitepaper/page.tsx`
   checks `whitepaperExists()` on the server and renders either the form or a
   "coming soon" notice, so the form can never take an address for a document
   that isn't there.
2. `POST /api/whitepaper/request` — validates consent, mints a 32-byte token,
   stores its sha256 on the lead (`whitepaperLeads.saveRequest`) and mails the
   confirmation link. The plaintext token exists only in that mail.
3. `GET /{locale}/whitepaper/confirm?token=…` — a page with a button, not an
   auto-confirm on load: link scanners in corporate mail gateways follow URLs,
   and a scanner must not be able to opt someone in.
4. `POST /api/whitepaper/confirm` — redeems the token
   (`whitepaperLeads.confirmRequest`), mails the PDF as an attachment, records
   delivery, and notifies the team at `NEXT_PUBLIC_EMAIL_ADRESS`.

Both mails go out through Resend from `NEXT_PUBLIC_EMAIL_ADRESS`
(`touch@advantisgroup.de` in production) — the same sender and the same
`apps/marketing` Resend client the contact form uses. No new env vars.

## Where things live

- `apps/marketing/private/whitepaper.pdf` — the document. Not under `public/`;
  see that directory's README.
- `apps/marketing/src/lib/whitepaper.ts` — file access, the attachment name,
  the consent version, the token TTL (48 h).
- `apps/marketing/src/app/api/[[...slugs]]/whitepaper/` — the two routes.
- `apps/marketing/src/components/whitepaper/` — landing, form, confirm UI.
- `apps/marketing/src/components/email/whitepaper-emails.tsx` — both mails,
  localized from `i18n/messages/{de,en,fr,zh}.json` under `whitepaper.email`.
- `packages/convex/convex/whitepaperLeads.ts` — the four mutations.

## Consent and proof

Every lead row carries the consent version it was taken under
(`WHITEPAPER_CONSENT_VERSION`), the request and confirmation IP addresses, and
the timestamps of both steps — the record you need if an opt-in is ever
challenged. **Bump `WHITEPAPER_CONSENT_VERSION` whenever the consent wording
in `whitepaper.form.consent` changes**, otherwise older rows claim agreement to
text nobody was shown.

## Abuse guard

Anyone can type any address into the form, so `saveRequest` refuses to re-arm
the token within five minutes of a confirmation mail: the second submission
updates the lead's details, skips the mail, and leaves the link already in the
recipient's inbox as the one that works. A confirmation link is also spent once
delivery succeeds — replaying it reports "already sent" rather than mailing the
PDF again.

## Reading the leads

There is no intranet view; leads live in the `whitepaperLeads` Convex table
(same as contact submissions in `emails`), and the notification mail on every
confirmed lead is how one actually reaches the team.
