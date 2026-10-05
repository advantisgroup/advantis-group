# HANDOVER – Website & Intranet (advantisgroup.de / intern.advantisgroup.de)

Technische Übergabe-Dokumentation für einen neuen Betreuer. Stand: 21.09.2026.
Aus dem Repository abgeleitet – **keine Werte oder Secrets** enthalten.
Alles, was sich nicht sicher aus dem Code ablesen lässt, ist mit **„TODO: klären"** markiert.

Ergänzend im Repo: `AGENTS.md` (Konventionen), `docs/architecture/overview.md` (Diagramm „wer ruft wen"),
`docs/backups.md`, `docs/convex-best-practices.md`, `docs/password-resets.md`, `docs/publish-guide.md`.

---

## 1. Zweck & Architektur

Ein Monorepo (Bun-Workspaces + Turborepo) mit drei Apps und einem gemeinsamen Backend:

| Teil | Pfad | Zweck | Domain |
| --- | --- | --- | --- |
| Marketing | `apps/marketing` | Öffentliche Website (Next.js, 4 Sprachen: de/en/zh/fr), Blog, Kontaktformulare, Whitepaper-Download | advantisgroup.de |
| Intranet | `apps/intranet` | Interne Plattform (Next.js, Clerk-Login, de/en) | intern.advantisgroup.de |
| API | `apps/api` | Elysia-Server („Integrations-Rand"): Secrets, KI, OneDrive, Clockodo, Passkeys/TOTP, Webhooks | api.advantisgroup.de (laut Doku; TODO: klären) |
| Backend | `packages/convex` | Convex-Schema + Funktionen + HTTP-Actions + Crons, von allen drei Apps genutzt | Convex (Prod hinter `backend.advantisgroup.de`, siehe `next.config.ts`) |
| Geteilt | `packages/types`, `packages/api-contract`, `packages/config` | Typen, API-Vertrag (Eden), Config | – |

**Wer redet mit wem** (Kurzfassung, Details in `docs/architecture/overview.md`):

- Browser → Convex direkt (Queries/Mutations, authentifiziert per Clerk-JWT).
- Browser → `apps/api` für alles, was Secrets braucht (KI/Anthropic, OneDrive/Graph, Clockodo, Passkeys/TOTP/Step-up, Bewerber-Tresor, Performance-Uploads). Die API prüft die Clerk-Session und ruft Convex mit dem `CONVEX_SERVER_KEY` auf.
- Convex → `apps/api` (über `lib/internalApi.ts`): Mailversand, OneDrive-Abo-Erneuerung.
- Webhooks (Clerk, Resend, Microsoft Graph) landen auf `apps/api` und werden per Server-Key nach Convex weitergereicht.
- Marketing hat eigene API-Routen (`apps/marketing/src/app/api/[[...slugs]]`: `email`, `notify`, `submissions`, `whitepaper`), die Mails direkt über Resend versenden und Leads in Convex speichern.
- Nächtliches Backup: GitHub Action → `convex export` → age-verschlüsselt → OneDrive über die API.

**Ordnerstruktur (Auszug)**

```
apps/
  intranet/src/{app,components,lib,i18n}      Next.js App Router, Routen unter app/(app)/…
  marketing/src/{app,components,lib,i18n}     Next.js, Locale-Routing [locale]
  api/src/{routes,lib}                        routes/ öffentlich, routes/internal/ nur Convex, routes/webhooks/
packages/convex/convex/
  schema.ts + tables/*.ts                     Tabellen nach Bereich
  <feature>/*.ts                              Funktionen je Feature (hr, performance, security, …)
  functions.ts                                Builder (userQuery, serverMutation, …) – immer diese nutzen
  http.ts, crons.ts, auth.config.ts
scripts/                                      Preview-/Ignore-Build-Skripte, Backup-Upload, Update-Publisher
docs/                                         Architektur- und Betriebsdoku
.github/workflows/                            code-quality, convex-deploy, convex-backup
```

**Intranet-Bereiche** (`apps/intranet/src/app/(app)`): admin, announcements, applicants/hr, approvals, blog, calendar, chat, clockodo (Absenzen), directory, drafts, errors/fehlermanagement, files (OneDrive), guidebooks, it-tickets, notifications, playground, sales-coach-ev, sales-cockpit, settings, suggestions, updates, wiki-chat. Zusätzlich öffentlich (ohne Clerk): `/performance` (eigener Passwort-Login, mandantenfähiges Sales-KPI-Dashboard), `/wallbox-sales-academy`, `/password`, `/privacy`, `/terms`, `/imprint`, `/sign-in`, `/sign-up`.

**Mandanten-Domains (Performance):** Das Intranet-Middleware (`apps/intranet/src/proxy.ts`) schaut den `Host` in Convex (`companies.getByDomain`) nach; ist er eine aktive Kundendomain, wird auf `/performance` umgeschrieben, ohne Clerk. Neue Kundendomains werden per Vercel-Domains-API automatisch zum Projekt hinzugefügt (`VERCEL_API_TOKEN`, siehe Abschnitt 4). Die API erlaubt diese Domains dynamisch per CORS.

---

## 2. Tech-Stack (Versionen laut `bun.lock` / `package.json`)

- Paketmanager: **Bun 1.3.14** (`packageManager`), Node ≥ 18. Monorepo-Runner: Turborepo 2.x.
- Sprache: **TypeScript 7.0.x** (Root/Apps), 5.9 in `apps/api` und `packages/convex`.
- Frontend: **Next.js 16.2.12**, **React 19.2.8** (React Compiler aktiv in Prod-Builds), Tailwind CSS 4, Radix UI, next-intl 4, framer-motion, recharts, react-pdf, shiki. Marketing zusätzlich GSAP, tsparticles, Lenis.
- Backend: **Convex 1.46** (+ `convex-helpers`, `zod` 4, Tests mit `convex-test` 0.0.59 – **muss versionsgleich zu `convex` bleiben**).
- API: **Elysia 1.4.29** auf Bun/Vercel-Function, Eden-Client, `@clerk/backend`, `@anthropic-ai/sdk`, `@simplewebauthn/server`, `otpauth`, `svix`, `resend`, `@upstash/*`.
- Auth: **Clerk** (`@clerk/nextjs` 7.6.1).
- Lint/Format: **oxlint** und **oxfmt** (nicht Prettier/ESLint ausführen). Tests: `bun test` (API), Vitest (Convex), Playwright (Intranet-E2E, `apps/intranet/playwright.config.ts`).
- KI-Modell: `claude-sonnet-4-6` (`apps/api/src/lib/ai.ts`).

---

## 3. Externe Dienste und ihre Rolle

| Dienst | Rolle | Wo im Code |
| --- | --- | --- |
| **Vercel** | Hosting/Deployment der Apps (Marketing, Intranet, API), Domains, Preview-Deploys, Firewall | `scripts/vercel-*`, `apps/api/vercel.json` |
| **Convex** | Datenbank, Serverfunktionen, Dateispeicher, Crons, HTTP-Actions | `packages/convex` |
| **Clerk** | Login/Benutzerverwaltung für alle Apps, JWT-Template `convex`, Webhooks | `auth.config.ts`, `apps/api/src/lib/clerk.ts`, `routes/webhooks/clerk.ts` |
| **Resend** | Mailversand (Intranet-Transaktionsmails, Updates-Broadcasts, Marketing-Kontaktformulare, Whitepaper), Webhook für Zustell-Events | `apps/api/src/lib/resend.ts`, `apps/marketing/src/app/api/…` |
| **Anthropic (Claude)** | KI: Wiki-Chat, Sales Coach EV, Tagesbrief, „Ask", Navigation, Wiki-Formatierung/-Import | `apps/api/src/lib/anthropic.ts`, `routes/*` |
| **Microsoft Graph / OneDrive** | Dateibrowser im Intranet, Backup-Ziel; **persönliches** MS-Konto (chefsache@) mit Delegated-Flow | `apps/api/src/lib/onedrive/*` |
| **Clockodo** | Zeiterfassung + Absenzen (Absenzen werden live abgefragt, nicht gespiegelt) | `apps/api/src/lib/clockodo.ts`, `convex/integrations/clockodo/*` |
| **Upstash Redis (KV)** | Rate-Limiting (API und Marketing-Formulare), Clockodo-Cache | `apps/api/src/lib/redis.ts`, `apps/marketing/src/lib/rate-limit.ts` |
| **PostHog (EU)** | Produkt-Analytics im Intranet (Proxy `/ingest`), serverseitige Events aus Convex | `apps/intranet/src/instrumentation-client.ts`, `convex/integrations/posthog.ts` |
| **GitHub** | Repo, Actions (Quality, Convex-Deploy, nächtliches Backup) | `.github/workflows` |
| **age** | Verschlüsselung der Backups (Schlüsselpaar liegt beim Betreiber) | `docs/backups.md` |

Auffälligkeiten (bitte klären):

- `@supabase/ssr` und `@supabase/supabase-js` sind in `apps/marketing/package.json` deklariert, im Quellcode aber **nirgends benutzt** → vermutlich tote Abhängigkeit. TODO: klären, ob es je ein Supabase-Projekt gab (ggf. Konto/Kosten prüfen).
- Marketing: Kommentar in `next.config.ts` sagt „PostHog is gone" – Marketing nutzt eine eigene, cookiearme Analytics-Lösung in Convex (`analyticsPageviews`, `analyticsEvents`). Die Env-Vars `NEXT_PUBLIC_POSTHOG_*` in `.env.example` gelten nur fürs Intranet.
- `.env.example` erwähnt „Sentry/Storage/Payment" **nicht**; im Code gibt es keine Sentry- oder Payment-Integration. TODO: klären, ob es außerhalb des Repos weitere Dienste gibt (Vercel-Marketplace-Integrationen, Domain-Registrar, DNS).
- Die Vercel-Marketplace-Integration für Upstash/KV legt `KV_*` und `REDIS_URL` an. TODO: klären, in welchem Konto sie liegt.

---

## 4. Environment-Variablen (nur Namen und Zweck)

Vorlagen: `/.env.example` (gesamt), `apps/intranet/.env.example`, `apps/api/.env.example`. `bun run setup-env` (`scripts/setup-env.mjs`) hilft beim Anlegen.
Wichtig: `NEXT_PUBLIC_*` werden pro App zur Build-Zeit eingebacken – jede App braucht ihre eigenen Werte.

Hinweis zu den Beispiel-Deployments: `.env.example` der Apps nennt `wry-turtle-334.convex.cloud`; das PDF nennt `whimsical-retriever-106` als Produktion. **TODO: klären, welches die aktuelle Produktions-Deployment ist** (ggf. ist das eine alt, das andere aktuell).

### 4.1 Convex-Deployment (im Convex-Dashboard bzw. `npx convex env set …`)

| Variable | Zweck |
| --- | --- |
| `CONVEX_SERVER_KEY` | Gemeinsames Geheimnis, das jede `api*`/`server*`-Funktion prüft; muss identisch in Convex, `apps/api` und GitHub-Secrets sein |
| `CLERK_JWT_ISSUER_DOMAIN` | Issuer der Clerk-Instanz für die JWT-Prüfung (`auth.config.ts`) |
| `CLERK_SECRET_KEY` | Convex ruft Clerk-Admin-API (Einladungen, Sperren, Löschen, Umbenennen) |
| `ADMIN_EMAILS` | Kommagetrennte Mailadressen, die beim ersten Login Admin werden |
| `ALLOWED_EMAIL_DOMAINS` | Erlaubte Firmen-Domains; andere Adressen gelten als „extern" |
| `INTERNAL_URL` | Basis-URL des Intranets in Links (Mails, Passwort-Reset, Step-up) |
| `API_URL` / `API_INTERNAL_URL` | Basis-URL von `apps/api` für Aufrufe von Convex → API |
| `CLOCKODO_API_USER`, `CLOCKODO_API_KEY`, `CLOCKODO_BASE_URL`, `CLOCKODO_EXTERNAL_APP` | Clockodo-API-Zugang (Admin-Aktionen) |
| `PERFORMANCE_ADMIN_EMAILS`, `PERFORMANCE_SUPER_ADMIN_EMAILS` | Wer sich den Performance-Admin bzw. Super-Admin selbst zuweisen darf |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Fügt Kundendomains automatisch zum Vercel-Projekt hinzu (Performance-Mandanten) |
| `PASSWORD_RESET_CONTACT_EMAIL` | Kontaktadresse in den Passwort-Reset-Texten |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Serverseitige PostHog-Events (leer = aus) |
| `DISABLE_CRONS` | `true` auf Preview/Dev, **nicht** auf Produktion (siehe Abschnitt 8) |

### 4.2 `apps/api` (Vercel-Projekt der API)

| Variable | Zweck |
| --- | --- |
| `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL` | Convex-Deployment (Fallback auf Preview-URL, siehe Abschnitt 8) |
| `CONVEX_SERVER_KEY` | s. o. |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET` | Session-Prüfung und Signatur des Clerk-Webhooks (svix) |
| `PORT`, `INTERNAL_URL`, `SITE_URL`, `CORS_ORIGINS` | Server-Port und erlaubte Origins (zusätzlich `*.advantisgroup.de`, `*.vercel.app`, aktive Mandanten-Domains) |
| `TRUSTED_PROXY_HOPS` | Anzahl vertrauenswürdiger Proxys für die Client-IP (Rate-Limit) |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ALLOWED_ORIGINS` | Passkeys; Produktion: `advantisgroup.de` + freigegebene Origins |
| `ANTHROPIC_API_KEY` | KI-Funktionen |
| `WIKI_CHAT_ENC_KEY`, `SALES_COACH_EV_ENC_KEY`, `TOTP_ENC_KEY` | 32-Byte-Base64-Schlüssel (AES-256-GCM) für Chat-Verlauf, Call-Transkripte, Authenticator-Secrets. **Verlust = Daten unlesbar; nicht rotieren ohne Migration.** |
| `RESEND_API_KEY`, `INTERNAL_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` | Mailversand, Absender, Signatur des Resend-Webhooks |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (`KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`) | Upstash Redis |
| `CLOCKODO_API_URL`, `CLOCKODO_API_USER`, `CLOCKODO_API_KEY`, `CLOCKODO_EXTERNAL_APP` | Clockodo-Zugriff |
| `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `ONEDRIVE_REFRESH_TOKEN`, `ONEDRIVE_AUTHORITY` | Microsoft-Graph-App und Startwert des Refresh-Tokens (der laufende Token wird verschlüsselt in Convex abgelegt und rotiert) |
| `ONEDRIVE_ROOT_PATH`, `ONEDRIVE_TEAM_PATH`, `ONEDRIVE_GF_PATH` | Ordnerstruktur in OneDrive |
| `ONEDRIVE_WEBHOOK_SECRET`, `ONEDRIVE_WEBHOOK_URL` | Change-Notifications von Graph (`/webhooks/onedrive`) |

### 4.3 `apps/intranet` (Vercel-Projekt Intranet)

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `…SIGN_UP_URL`, `…_FALLBACK_REDIRECT_URL` (Clerk);
`NEXT_PUBLIC_CONVEX_URL`; `NEXT_PUBLIC_API_URL` (URL der API);
`NEXT_PUBLIC_INTRANET_URL` (eigener Host, damit die Mandanten-Erkennung ihn überspringt – wird in `proxy.ts` gelesen, fehlt aber in `.env.example`; TODO: klären, ob gesetzt);
`NEXT_PUBLIC_MARKETING_URL` (Copy-Link-URLs); `NEXT_PUBLIC_ADRESS`, `NEXT_PUBLIC_EMAIL_ADRESS`, `NEXT_PUBLIC_PHONE_NUMBER` (Impressum/Datenschutz);
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`; optional `REACT_COMPILER=1` (lokal), `E2E_BASE_URL`, `CI` (Playwright).

### 4.4 `apps/marketing` (Vercel-Projekt Marketing)

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`; `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` (Analytics-Beacon → Convex-HTTP `/analytics/duration`);
`RESEND_API_KEY`; `NEXT_PUBLIC_EMAIL_ADRESS` (Empfänger *und* Absender-Adresse der Formularmails), `NEXT_PUBLIC_PHONE_NUMBER`, `NEXT_PUBLIC_ADRESS`, `NEXT_PUBLIC_DOMAIN` (eigene Domain), `NEXT_PUBLIC_INTRANET_URL` (Link ins Intranet für eingeloggte Firmen-Nutzer);
`NEXT_PUBLIC_ALLOW_SUBMISSIONS`, `ALLOW_SUBMISSIONS`, `NEXT_PUBLIC_SUBMISSION_TEXT` (+ `_DE`, `_ZH`, `_FR`) (Kontaktformular an/aus und Hinweistext);
`KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash, Rate-Limit: 1 Anfrage / 12 h je Client).

### 4.5 GitHub Actions (Settings → Secrets and variables)

Secrets: `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY`, `CONVEX_SERVER_KEY`, `API_URL`. Variable: `BACKUP_AGE_RECIPIENT` (öffentlicher age-Schlüssel).

Skripte: `bun run updates:publish` braucht `ADMIN_EMAILS`, `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SERVER_KEY`.

---

## 5. Datenmodell (Convex)

Schema: `packages/convex/convex/schema.ts`, Tabellen nach Bereich in `tables/`. Nach Bereich (ca. 140 Tabellen, Namen stehen in den Dateien):

- **identity.ts:** `users` (zentrale Identität, Rollen `admin`/`manager`/`employee`, Status inkl. `removed`), `passkeys`, `totpCredentials`, `departments`, `teams`, `userTeams`, `customRoles`, `invites`, `accessRequests`, `userPreferences`, Audit-Tabellen.
- **security.ts:** Step-up-Auth (`authPolicy`, `stepUp*`, `knownDevices`, `sessionRiskSignals`), Zweit-Mailadressen, Passwort-Resets (`passwordReset*`).
- **activity.ts (ActivityTrack, entfernt):** siehe unten.
- **comms.ts:** `announcements*`, `events`, `suggestions*`, `updates*` (Störungen/Wartung/Changelog inkl. Mail-Empfänger), `featureFlags`.
- **chat.ts:** `conversations`, `conversationMembers`, `messages`, `notifications`, `presence`, `typing`, Upload-Claims.
- **content.ts:** Guidebooks, Wiki, `blogPosts`, `analyticsPageviews`/`analyticsEvents`, Sales Academy (`academy*`).
- **hr.ts:** `applicants*` (Bewerber, Dokumente, Kontakte, Interviews, Audit, Tresor-Passwörter), `employeeProfiles`, `employeeDocuments`.
- **itTickets.ts:** IT-Tickets, Threads, Nachrichten, Offboarding-Checklisten, Vertretungen.
- **sales.ts:** Sales Coach EV (`salesCoachEv*`), Fehlermanagement (`error*`), Sales Cockpit (`salesCockpit*`).
- **performance.ts:** mandantenfähiges KPI-Dashboard (`companies`, `performanceLogins`, `performanceReports`, Rohdaten-Tabellen …).
- **integrations.ts:** `integrationHealth`, `onedriveUploads/Audit/Auth`, `auditLog`, `integrationsAuditLog`, `integrationsRawDebugLog`, `clockodoWebhookLog`, `backupRuns`.
- **ai.ts:** `wikiChats` (verschlüsselt), `aiRuns`, `aiFeedback`, `drafts*`.
- **marketing.ts:** `emails`, `notifyEmails`, `whitepaperLeads`.

Konventionen: Nutzer werden **nie gelöscht** (`status: "removed"`, sehr viele Fremdverweise); Inhalte werden per **Papierkorb** gelöscht (`deletedAt`, 30 Tage, `lib/trash.ts`).

### Mitarbeiter-Tracking (ActivityTrack) – entfernt

ActivityTrack (`/activity`, Desktop-Agent-Ingest `POST /ingest`, Genesys-/Clockodo-Statuspolling) wurde am 2026-10-05 vollständig entfernt. Code, Crons, API-Routen und Oberfläche sind weg; es wird nichts mehr erfasst.

Die Tabellen (`tables/activity.ts`: `devices`, `people`, `activitySamples`, `employeeStates`, `stateSamples`, `discardedStateSamples`, `dailyStats`, `activityPatternReports`, `activityAuditLog`, `activitySystemEvents`, `activitySettings`, `activityMigration*`) stehen nur noch im Schema, bis die Produktionsdaten gelöscht sind; danach Datei und Schema-Eintrag entfernen. Die nächtliche Löschung nach `retentionDays` läuft **nicht mehr** – die Daten bleiben bis zur manuellen Löschung liegen.
TODO: klären mit Datenschutz/Betriebsrat: Zeitpunkt der Löschung der Altdaten und Anpassung der Datenschutzerklärung (`privacy.json` beschreibt das Tracking noch).

---

## 6. Auth

- **Clerk** ist einzige Login-Quelle für Marketing, Intranet und API. Laut Code (`auth.config.ts`, `.env.example`, `docs`) läuft alles über **eine** Clerk-Instanz mit Root-Domain `advantisgroup.de`. Das PDF nennt aber **zwei** Instanzen (`yx1jw1nzih8f` Hauptseite, `cgifmba2kp71` Intranet). Im Code finden sich Reste der früheren Trennung (`INTERNAL_CLERK_JWT_ISSUER_DOMAIN` im Preview-Skript, Relink-Logik „Clerk instance merge" in `lib/auth.ts`). **TODO: klären, ob die zweite Instanz noch existiert/aktiv ist oder nur noch übrig ist.**
- Convex vertraut dem Clerk-JWT-Template `convex` (muss die Primär-Mail als `email`-Claim enthalten). Für Step-up gibt es ein weiteres Claim `reverificationAge` (`{{user.factor_verification_age}}`) – siehe `docs/password-resets.md`.
- **Rollen:** `admin`, `manager`, `employee` + **Custom-Roles** mit Fähigkeiten (`manage_members`, `access_integrations`, `access_files`, `manage_uploads`, `manage_announcements`, `manage_guidebooks`, `manage_blog`, `manage_it_ticket_threads`, `view_clockodo_team`, `manage_clockodo_team`, `use_ai`). Admin-Sandbox-Modus (`sandboxRole`) für Rollen-Vorschau. Zugriff wird in Convex über die Builder in `functions.ts` (`userQuery({ role, can })`, `ctx.caller`) durchgesetzt – **keine eigenen `ctx.auth`-Checks schreiben**.
- **Neue Mitarbeiter-Accounts:** Nur per **Einladung** (Admin/Manager → `people/invites.ts` legt Invite an, Clerk-Einladung geht per Mail raus, 7 Tage gültig) oder per **Zugriffsanfrage** mit Freigabe (`people/accessRequests.ts`). Der Clerk-Webhook `user.created` erzeugt **nie** automatisch Mitglieder, er hält nur bestehende Spiegel aktuell. Erster Admin: E-Mail in `ADMIN_EMAILS`. Adressen außerhalb `ALLOWED_EMAIL_DOMAINS` sind „extern", werden aber gleich behandelt (mit Bestätigungsdialog in der UI).
- **Entfernen:** `markUserRemoved` setzt `status: "removed"` und sperrt/löscht in Clerk (geplant, mit Retry: `people/clerkSync.ts`).
- **Zusatzfaktoren:** eigene Passkeys (WebAuthn, `WEBAUTHN_RP_ID=advantisgroup.de`), TOTP mit Recovery-Codes, Step-up-Richtlinien (`authPolicy`), bekannte Geräte.
- **Eigene Passwort-Bereiche außerhalb von Clerk:** Bewerber-Tresor (HR-Vault) und Performance-Login; Reset-Flow über Admin-Ping + Magic-Link (`/password?o=…&token=…`, Queue unter `/admin/password-resets`).
- **Öffentliche Intranet-Routen** (ohne Clerk): sign-in/up, `/performance`, `/password`, Rechtstexte.

---

## 7. Mails

Alle Intranet-Mails laufen über `apps/api/src/lib/resend.ts` (Absender `INTERNAL_EMAIL_FROM`, Default `Advantis Intranet <noreply@advantisgroup.de>`; HTML-Templates als Funktionen direkt in dieser Datei). Auslöser sind Convex-Funktionen, die die API über `lib/internalApi.ts` aufrufen (`routes/internal/notifications.ts`, `internal/updates.ts`).

| Mail | Wann |
| --- | --- |
| Einladung ins Intranet / Zugang genehmigt / Anfrage eingegangen | Einladung, Freigabe, Zugriffsanfrage |
| Absenz genehmigt/abgelehnt | Entscheidung im Absenz-Workflow |
| Upload genehmigt/abgelehnt | Datei-Upload-Freigabe (OneDrive) |
| Chat: „möchte sich wieder verbinden", ungelesene Nachrichten (Tages-Digest, Cron 05:30 UTC) | Chat-Benachrichtigungen |
| „Deine Woche im Intranet" (Manager-Wochenreport, Montag 05:45 UTC) | Wöchentlicher Cron |
| Einladung zur Sales Academy | Academy-Teilnehmer anlegen |
| Passwort-Reset angefordert (an Admins), Reset-Link, Sicherheitswarnung, Verifizierungscodes (E-Mail-Verifikation / Zweit-Mail) | Security-Flows |
| Updates-Broadcast (Störung/Wartung/Changelog) | Veröffentlichung per Admin-UI oder `bun run updates:publish`; Zustell-/Öffnungs-/Klick-Events kommen über den Resend-Webhook zurück |
| Clerk-eigene Mails (`email.created`) | Nur für Templates, bei denen im Clerk-Dashboard „Delivered by Clerk" **aus** ist – dann sendet die API sie über Resend (Grund: Zustellprobleme bei 1&1/GMX) |

**Marketing** (`apps/marketing/src/app/api/[[...slugs]]`): Kontaktformular (`email`) – Absender/Empfänger `NEXT_PUBLIC_EMAIL_ADRESS`; Whitepaper (`whitepaper`) – Bestätigungs-/Download-Mail an Interessenten + Info an `NEXT_PUBLIC_EMAIL_ADRESS`; `notify`/`submissions` speichern Einträge in Convex (`emails`, `notifyEmails`, `whitepaperLeads`). Templates: `apps/marketing/src/components/email/*` (React Email). Das Whitepaper-PDF liegt in `apps/marketing/private/` und wird zur Laufzeit gelesen.

Webhooks: `/webhooks/resend` (Zustellstatus), `/webhooks/clerk`, `/webhooks/onedrive` – alle in `integrationHealth` sichtbar (Admin-Panel).
TODO: klären, ob Resend/SES-Domain `send.`-Subdomain wie im PDF beschrieben gepflegt wird (DNS liegt nicht im Repo).

---

## 8. Deployment

- **Vercel:** Drei Projekte (Marketing, Intranet, API) aus demselben Repo. `vercel.json` gibt es nur in `apps/api` (leere Header). Root-Directory, Build-/Install-Command und „Ignored Build Step" sind **Dashboard-Einstellungen** – nicht im Repo. Verwendet werden: `scripts/vercel-ignore-build.mjs <app-dir>` (überspringt Builds ohne relevante Änderungen; `packages/convex`, `docs`, `scripts` lösen keinen App-Build aus), `scripts/vercel-preview-convex-build.sh` (Apps) und `scripts/vercel-preview-convex-api-build.sh` (API; `apps/api` `build` ruft es bereits selbst auf). TODO: klären: exakte Vercel-Projekt-Einstellungen (Root Directory, Build Command, Ignored Build Step) je Projekt notieren.
- **Push auf `main` = sofortiges Produktions-Deploy** der Apps. Feature-Branches erzeugen Preview-Deploys mit **eigener, branch-gebundener Convex-Preview-Deployment** (`npx convex deploy` im Build). Achtung: Jede Preview zählt gegen das Deployment-Limit des Convex-Teams und lässt sich nur im Dashboard löschen (siehe `AGENTS.md`).
- **Convex Produktion:** `.github/workflows/convex-deploy.yml` deployt bei Änderungen unter `packages/convex/**` auf `main` (`convex deploy --yes`). Auf Vercel wird Convex-Prod **nicht** vom Build deployt.
- **Crons:** `crons.ts` läuft auf jeder Deployment; auf Preview/Dev per `DISABLE_CRONS=true` abschalten (`npx convex env default set DISABLE_CRONS true --type preview` und `--type dev`; bestehende Previews einzeln). Produktion: Variable **nicht** setzen.
- **CI:** `code-quality.yml` bei PR/Push auf `main`: Format, Lint, `check:i18n`, `check:api-boundaries`, Type-Check, Tests. Lokal vor jedem Commit dasselbe laufen lassen.
- **Backups:** siehe `docs/backups.md` – (1) Papierkorb 30 Tage, (2) Convex-Backups (Dashboard-Einstellung, Pro-Plan, **nicht im Repo aktiviert; TODO: klären, ob eingeschaltet**), (3) nächtlicher verschlüsselter Export nach OneDrive `Backups/Convex` (03:15 UTC, 90 Tage). Wiederherstellung: Datei laden → `age -d -i <privater Schlüssel>` → `npx convex import --replace-all` **nur auf Dev/Preview testen**. Der private age-Schlüssel liegt **nicht** im Repo. TODO: klären, wer ihn hat und wo er gesichert ist; ob die vierteljährliche Restore-Probe je gemacht wurde.
- Reihenfolge bei Schema-Änderungen: Convex zuerst deployen (Action), dann Apps – App-Code darf keine Funktionen aufrufen, die es in Prod noch nicht gibt.
- Merge-Regel im Repo: Fertige Arbeit wird per Squash direkt nach `main` gebracht, sofern kein PR verlangt ist; bei Mehrschritt-Arbeit erst am Ende (siehe `AGENTS.md`).

---

## 9. Vercel-Konfiguration

- **Im Repo:** `apps/api/vercel.json` (nur Schema, `headers: []`). Rewrites/Redirects stehen in den `next.config.ts`:
  - Intranet: Rewrites `/hr/*`→`/applicants/*`, `/clockodo/manage/*`→`/admin/integrations/clockodo/*`, PostHog-Proxy `/ingest/*` → `eu.i.posthog.com`; permanente Redirects u. a. `/absences/*`→`/clockodo/*`, `/applicants/*`→`/hr/*`, `/t/*`→`/playground/*`. Erlaubte Bild-Hosts: `*.convex.cloud`, `backend.advantisgroup.de`, `img.clerk.com`.
  - Marketing: `skipTrailingSlashRedirect: true` (bewusst – würde sonst jede URL mit Slash umleiten), Sprach-Routing per next-intl (`localePrefix: always`), Whitepaper-PDF wird per `outputFileTracingIncludes` mitgebündelt.
  - Sicherheits-Header (CSP etc.) sind im Repo **nicht** gesetzt. TODO: klären, ob sie im Vercel-Dashboard konfiguriert sind.
- **Nur im Dashboard (nicht im Repo):** Firewall-/Bot-Schutz/„Attack Challenge Mode", Domains und Zuordnung zu Projekten, Umgebungsvariablen je Umgebung, Deployment Protection, Ignored-Build-Step, Team-Mitglieder.
  - **TODO: klären: Ist der Challenge-/Bot-Schutz bewusst so streng? Warum?** (Das PDF fragt danach; aus dem Code nicht ableitbar. Er kann Webhooks (Clerk, Resend, Graph) und Server-zu-Server-Aufrufe der API blockieren – bei Problemen dort zuerst schauen.)
- **Domains:** `advantisgroup.de` (Marketing), `intern.advantisgroup.de` (Intranet), API-Subdomain (`api.advantisgroup.de` laut Kommentaren), `backend.advantisgroup.de` (Convex-Custom-Domain), Mandanten-Domains werden dynamisch angelegt (`convex/performance/companies.ts`).

---

## 10. Bekannte Probleme, Todos, Design-Entscheidungen, Stolperfallen

**Bewusste Entscheidungen**
- Absenzen werden nicht gespiegelt, sondern live von Clockodo geholt (kurz in Upstash gecacht). Kalender zeigt anderen nur Urlaub; Krank/Sonstiges sieht nur die Person selbst. Alte `absences`-Tabelle existiert nicht mehr im Schema, alte Zeilen können noch in der DB liegen.
- Die öffentlichen `api*`-Funktionen in Convex sind **absichtlich** öffentlich und prüfen den Server-Key selbst. Nicht auf `internal` umstellen – bricht die Integrationen.
- Aufbewahrung Bewerberdaten: `APPLICANT_RETENTION_DAYS` = 183 Tage (Cron 02:40 UTC), Talentpool bis 24 Monate. **TODO: klären mit Datenschutz, ob 183 Tage passen.**
- Wichtig: `.collect()` nur auf kleinen Tabellen (`users`, `presence`, `departments`); wachsende Tabellen (`messages`, Audit, `notifications`) nur mit `.take()`/`.paginate()`.
- `packages/convex` ist ohne Build-Schritt; einzelne Pfade (`performance/callImport`, `xlsxZip`) werden vom Intranet als rohes TS transpiliert.
- Radix-Dialog-Override im Root-`package.json` (vaul-Duplikat sperrt sonst Klicks) – siehe `docs/radix-vaul-dedupe.md`.
- Übersetzungen immer **zusammen** pflegen: `apps/intranet/src/i18n/messages/{en,de}/*.json` (neue Namespaces in `i18n/request.ts` eintragen!); Marketing hat de/en/zh/fr.
- Bibliotheken für Drittmarken (Clockodo): keine Logos im Repo, vor Einbau rechtlich klären.

**Stolperfallen**
- **Lokales Marketing-Preview:** `apps/marketing/src/proxy.ts` läuft immer durch Clerk; ohne echte Keys liefert jede Route einen Clerk-Fehler. Die dokumentierte Stub-Variante (`AGENTS.md`) niemals committen.
- `convex-test` muss zur `convex`-Version passen (sonst kryptischer `instanceof`-Fehler).
- Vorschau-Backends resetten sich, wenn das Convex-Deployment-Limit erreicht ist (Dashboard prüfen).
- `INTERNAL_CLERK_JWT_ISSUER_DOMAIN` im Preview-Skript ist ein Relikt der Zwei-Instanzen-Zeit (s. Abschnitt 6).
- Passwort-Resets: Clerk sperrt das Claim `fva`; deshalb heißt es `reverificationAge`.
- ActivityTrack ist entfernt. TODO: klären, ob das alte eigenständige ActivityTrack-Convex-Projekt noch läuft (Kosten/Daten), und den Desktop-Agent (Tauri, Windows, eigenes Repo „ActivityTrack") auf allen Rechnern deinstallieren.
- OneDrive läuft über ein **persönliches** Microsoft-Konto (chefsache@) – Personenabhängigkeit! Ziel der Übergabe: auf Firmenkonto/SharePoint umstellen. Der Refresh-Token rotiert und liegt verschlüsselt in Convex (`onedriveAuth`); Neu-Autorisierung per `bun run onedrive:auth` in `apps/api`.
- Alle `NEXT_PUBLIC_*`-Werte ändern sich erst nach neuem Build.
- Kein Bash/Shell-Zwang: Der Code läuft unter Windows/macOS/Linux; `bun` muss installiert sein.
- Für Rechtstexte/Impressum nutzen die Apps `NEXT_PUBLIC_ADRESS/EMAIL_ADRESS/PHONE_NUMBER` (Schreibweise „ADRESS" ist so im Code).

**Offene Todos aus dem Übergabeprozess (nicht aus dem Code):**
- TODO: klären – Abrechnung je Dienst (Vercel, Convex, Clerk, Resend, Upstash, Anthropic, PostHog, Clockodo, Genesys, Domain/DNS) und wessen Konto/Zahlungsmethode.
- TODO: klären – Ownership: GitHub-Repo (Firmen-Organisation?), Vercel-Team (zweiter Owner), Convex-Team, Clerk (Admin in beiden Instanzen), Resend, Upstash, PostHog, Anthropic-Key.
- TODO: klären – bekannte Bugs/offene Aufgaben (keine `TODO/FIXME`-Kommentare im Code; Ideen liegen in `docs/future-features/*.md` und `docs/intranet-management-feature-ideas.md`).
- Empfehlung: **Secrets rotieren** nach der Übergabe (Clerk, Resend, Anthropic, Convex Deploy Key/Server Key, Graph-Client-Secret, Clockodo, Genesys, Vercel-Token) – aber Verschlüsselungsschlüssel (`*_ENC_KEY`) nicht ohne Migration ändern.

---

## 11. Lokales Setup Schritt für Schritt

Voraussetzungen: Git, **Bun ≥ 1.3.14**, Node ≥ 18, Zugang zu Convex- und Clerk-Dashboard, Werte der Env-Vars (persönlich/1Password, nicht per Mail).

1. Repo klonen und **zuerst `main` aktualisieren** (`git pull`).
2. Abhängigkeiten installieren:
   ```bash
   bun install
   ```
3. Env-Dateien anlegen (nicht committen – `.env*` ist gitignored):
   - `apps/intranet/.env.local` ← `apps/intranet/.env.example`
   - `apps/api/.env.local` (bzw. `.env`) ← `apps/api/.env.example`
   - `apps/marketing/.env.local` mit den Variablen aus 4.4
   - `packages/convex/.env.local` (setzt `npx convex dev` selbst: `CONVEX_DEPLOYMENT`, `CONVEX_URL`)
   - Hilfsskript: `bun run setup-env`
4. **Eigenes Dev-Convex-Deployment** verwenden, nie Produktion:
   ```bash
   cd packages/convex
   npx convex dev
   ```
   Dort die Convex-Env-Vars aus 4.1 im Dashboard setzen, mindestens `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `CONVEX_SERVER_KEY`, `ADMIN_EMAILS` (eigene Mail), `ALLOWED_EMAIL_DOMAINS`, `INTERNAL_URL`, `DISABLE_CRONS=true`.
5. **Clerk:** Dev-Instanz oder Test-Keys nutzen; JWT-Template `convex` mit `email`-Claim anlegen (ggf. `reverificationAge` für Step-up).
6. Apps starten (Ports: Marketing 3000, Intranet 3001, API 3002):
   ```bash
   bun run dev:convex
   bun run dev:api
   bun run dev:intranet
   bun run dev:marketing
   ```
   (`bun run dev` startet alles per Turbo.) Ohne echte Clerk-Keys rendert Marketing nicht (siehe Stolperfallen).
7. **Test-Login:** Mit einer in `ADMIN_EMAILS` eingetragenen Adresse im Intranet unter `/sign-up` bzw. `/sign-in` anmelden – der erste Login legt den Admin-Benutzer an. Weitere Test-Accounts per Einladung (Admin → Mitglieder). Einen Standard-Testaccount gibt es nicht. TODO: klären, ob ein Test-/Demo-Account in Clerk existiert.
8. **Qualität prüfen vor jedem Commit:**
   ```bash
   bun run format:check
   bun run lint
   bun run check:i18n
   bun run check:api-boundaries
   bun run type-check
   bun run test
   ```
   Schnell nur Convex: `cd packages/convex && npx tsc --noEmit`; Convex-Tests: `bun run test:convex`. Formatieren: `bun run format` (oxfmt).
9. Optional: Update im Intranet veröffentlichen (`bun run updates:publish`, siehe `docs/publish-guide.md`); OneDrive-Token neu holen: `cd apps/api && bun run onedrive:auth`.

**Empfohlene Übergabesession (30–60 Min):** Vercel-Projekte + Env-Vars durchgehen → Convex-Dashboard (Deployment, Backups, Env) → Clerk (Instanzen, JWT-Template, Webhooks) → Resend (Domain, Webhook) → einen Test-Deploy über einen Branch auslösen → Restore-Drill mit dem letzten Backup.
