# Architecture overview

Hand-checked against the code — update it when an arrow below stops being
true. Generated diagrams (gitdiagram etc.) guess, and get the Clockodo and
ingest paths wrong.

```mermaid
flowchart TD
  employee(["Employee"])
  visitor(["Public visitor"])
  agent(["Desktop agent<br/>(Windows tray app)"])

  subgraph apps["apps/"]
    intranet["intranet<br/>Next.js"]
    marketing["marketing<br/>Next.js"]
    api["api<br/>Elysia — the integration edge"]
  end

  subgraph convex["packages/convex"]
    functions["Function modules<br/>convex/*.ts"]
    http["HTTP actions<br/>/ingest, /agent/*"]
    crons["crons.ts"]
    lib["lib/<br/>auth, stepUp, internalApi, …"]
    db[("Database<br/>schema.ts → tables/*")]
  end

  subgraph external["External services"]
    services["Anthropic · Microsoft Graph · Clockodo<br/>Genesys · Resend · Upstash · Clerk"]
  end

  employee --> intranet
  visitor --> marketing
  agent -- "activity samples" --> http

  intranet -- "queries & mutations" --> functions
  intranet -- "AI, files, absences, security" --> api
  marketing -- "blog, leads, analytics" --> functions

  api -- "api* functions, server key" --> functions
  functions -- "/internal/*, server key" --> api
  http --> functions
  crons --> functions
  functions --> lib
  functions --> db

  api -- "outbound calls" --> services
  services -- "webhooks" --> api
  functions -- "Genesys & Clockodo polling" --> services
```

## Who talks to whom

- **Browser → Convex directly.** Most intranet reads and writes are Convex
  queries/mutations authenticated by the Clerk JWT, gated in
  `lib/auth.ts` (`requireUser`, `requireCapability`, …).
- **Browser → apps/api.** Anything that needs a secret Convex can't or
  shouldn't hold: AI (Anthropic), OneDrive (Graph), Clockodo absences and
  clock entries, passkeys/TOTP/step-up, the applicant vault, Performance
  uploads. apps/api resolves the Clerk session, then calls Convex's `api*`
  functions with `CONVEX_SERVER_KEY` (checked by `assertServerKey`).
- **Convex → apps/api.** The other direction, via `lib/internalApi.ts`:
  Clockodo absences for the ActivityTrack poller, transactional and
  broadcast email (apps/api owns Resend), OneDrive subscription renewal.
- **Desktop agent → Convex HTTP.** `POST /ingest` with a per-device token;
  `ingest.ts` resolves device → person → employee itself (see AGENTS.md's
  ActivityTrack section).
- **Webhooks land on apps/api** (Clerk, Graph, Resend, Genesys, Clockodo)
  and are relayed into Convex with the server key.
- **Clerk** signs users into all three apps; Convex trusts its JWT and
  apps/api verifies the session itself.
- **Marketing** also has its own pp/api routes that mail contact and
  whitepaper requests through Resend directly.
- **Absences are never mirrored.** apps/api fetches them live from
  Clockodo on every read (cached briefly in Upstash).

## Where code lives

| Layer | Path | Notes |
| --- | --- | --- |
| Intranet UI | `apps/intranet/src` | `app/` routes, `components/` by feature, `components/ui` shared primitives, `lib/` client helpers |
| Marketing | `apps/marketing/src` | public site; `app/api/[[...slugs]]` for its own form endpoints |
| Integration edge | `apps/api/src` | `routes/` public, `routes/internal/` Convex-only, `routes/webhooks/`; `lib/` one client per provider |
| Backend functions | `packages/convex/convex/*.ts` | one module per feature; these paths are the `api.*` names, so don't move functions casually |
| Backend helpers | `packages/convex/convex/lib/` | access checks, step-up, validators, shared helpers — no Convex functions here |
| Schema | `packages/convex/convex/schema.ts` + `tables/` | tables grouped by area; validators in `lib/validators.ts` |
| Shared types | `packages/types`, `packages/api-contract` | apps/api may only `import type` from these (no runtime load on Vercel) |
