# Whitepaper source

Drop the whitepaper PDF in here as **`whitepaper.pdf`**. Nothing else in this
directory is read.

The file is deliberately *not* in `apps/marketing/public/` — the request form
at `/whitepaper` is what gates the download, and a copy under `public/` would
be a plain URL anyone could pass around. `next.config.ts`
(`outputFileTracingIncludes`) ships this directory into the server bundle so
the API route can attach it to the delivery mail.

Until `whitepaper.pdf` exists, `/whitepaper` renders a "coming soon" notice
instead of the form and `POST /api/whitepaper/request` answers `503` — no lead
is ever taken for a document that cannot be sent. `/whitepaper` is statically
generated, so the switch flips at build time: adding the PDF needs a deploy,
which committing it triggers anyway.

Recipients see the attachment under the name set by `WHITEPAPER_FILENAME` in
`src/lib/whitepaper.ts`, not the on-disk name.
