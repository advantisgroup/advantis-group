# Marketing site: hero visual & nav dropdown redesign plan

Written for whoever implements next (flagged for Opus 5). This is a plan, not
a finished implementation — the two pieces below (`HeroSignal.tsx` and the
desktop nav dropdown in `Header.tsx`) are functional today but were called
out as weak in review. Research and diagnosis are below; the actual
implementation call is left open where noted.

## 1. Hero visual (`apps/marketing/src/components/sections/home/HeroSignal.tsx`)

### Current state
A small (`max-w-sm`, roughly square) panel to the right of the hero headline
(wired up in `Hero.tsx`, `lg:` only). It shows a dashed cross, a pulsing
center dot, and four small pill labels (SIGNAL / AI CHECK / ROUTING / CLOSE)
at the cardinal points. Feedback: "genuinely looks boring."

### Why it reads as boring
- **Too small and too sparse.** It occupies a narrow side column while the
  reference sites below give their hero visual equal or greater weight than
  the headline itself.
- **No real content.** Four short labels and some dashed lines is pure
  geometry — there's no story playing out, nothing that looks like it's
  actually doing something.
- **Motion is decorative, not narrative.** The pulse rings are a nice touch
  but they're the *only* thing moving, and they don't represent anything
  happening — compare to the sites below, where the motion **is** the
  content (a conversation streaming in, a cursor moving, code being written).

### Research — what makes these hero visuals feel alive
Checked live: [linear.app](https://linear.app), [attio.com](https://attio.com),
[clay.com](https://clay.com), [framer.com](https://framer.com), plus
Clerk.com's nav (relevant to §2, not the hero).

- **Linear**: the hero visual is enormous — a full app screenshot in one
  large rounded panel, showing an actual issue thread with a live-looking
  conversation (avatars, timestamps, a "Right now we show a spinner
  forever…" comment thread). It feels alive because it looks like something
  is genuinely happening inside it, not because of background animation.
- **Attio**: pill-shaped buttons, a soft gradient backdrop, and a
  browser-chrome-style mockup (traffic-light dots, a real-looking chat
  panel) — again, a plausible in-progress scene, not abstract shapes.
- **Clay**: the opposite extreme — a large, colorful, custom 3D-illustrated
  scene (funnel, conveyor belt, factory). Very high production value, very
  on-brand for Clay, but the playful claymation style doesn't fit Advantis's
  more serious B2B tone. Included for contrast, not as a template.
- **Framer**: a large panel with a soft animated glow around its border and
  an animated "agent building a page" demo inside — the glow-border effect
  itself is a nice ambient touch worth borrowing regardless of what's inside
  the panel.

Common thread: **big, not small; a scene, not a diagram; content in motion,
not just background decoration.**

### The constraint that's specific to Advantis
Every reference example above shows an actual product screenshot. Advantis
sells a service, not software — `PipelineSchematic.tsx` has an explicit
comment about this: showing a fake dashboard "would be claiming something
untrue." Whatever replaces `HeroSignal` needs to keep that honesty, which
rules out literally copying the "product screenshot in a browser chrome"
pattern.

### Directions worth considering (pick one, or propose better)
1. **A "live activity feed" mockup.** A card styled like a real internal
   tool (timestamps, small avatars, status pills) showing a plausible,
   clearly-illustrative flow: *"New lead — Herr Mustermann" → "AI
   qualifying…" → "Routed to Andrea R." → "In call" → "Closed ✓"*, with rows
   appearing one at a time on a loop. This is the closest analogue to
   Linear's approach (a scene with real content) without pretending Advantis
   has a SaaS product — it's presented as an illustration of the mechanism
   `PipelineSchematic` already describes in words, the way a diagram would
   be, just with more texture (names, times, avatars, status color) than the
   current geometric version.
2. **Scale up the existing "signal" concept substantially.** Keep the
   pulse-at-center idea (it's not a bad concept) but make it much bigger —
   closer to the height of the whole hero — with real depth: layered
   glassmorphic cards instead of flat pill labels, a soft animated glow
   around the panel border (borrow this from Framer), more particles/motion
   paths, and a subtle cursor-follow tilt. Addresses "boring" via scale and
   richness rather than a new concept.
3. **Something else entirely** — e.g., an animated data/geography
   visualization, a stylized team/office photo treatment with parallax
   (there's already a `ParallaxPhoto` pattern on the team page that could be
   adapted). Open to a better idea than the two above.

Whichever direction: it should feel *at least* as visually weighted as the
headline column, not a small side accent.

## 2. Desktop nav dropdown (`apps/marketing/src/components/layout/Header.tsx`)

### Current state
One "Menu" dropdown (`Header.tsx:194-253`) contains, stacked vertically:
- A 2-column grid of nav links (`Header.tsx:205`, `grid grid-cols-2 gap-px
  bg-rule`) — title + description per cell, hairline dividers between every
  cell, **no icons**.
- Language + appearance pills (`Header.tsx:232`, `<SettingsMenu inline />`).
- An intranet link and the account avatar (`Header.tsx:249`).

Feedback, with a side-by-side against Clerk.com's own nav: "this is bs."

### What Clerk does that we don't
- **One dropdown, one job.** "Products" is a nav-destination dropdown.
  "Docs" is a separate SDK/documentation dropdown. Neither mixes in
  account settings, language, or theme — those live elsewhere (account
  menu, footer). Ours combines navigation + language + appearance +
  account into a single dropdown, which is doing three unrelated jobs at
  once.
- **Icon + title + description per row**, not just title + description.
  Every Clerk item has a small icon in a subtle badge to its left — it reads
  faster and feels considered, not just a text list.
- **No visible grid lines between rows.** Clerk's list flows as one smooth
  surface with generous padding; ours draws a hairline between every single
  cell (the `gap-px bg-rule` mosaic technique used elsewhere on the site),
  which reads as a spreadsheet next to Clerk's clean list.

### Recommended direction
1. **Split by purpose.** Keep the "Menu" dropdown to navigation only (the 6
   nav links). Move language + appearance + account out of it — options:
   a small settings icon-button elsewhere in the header opening its own
   compact popover (mirrors Clerk's separate, single-purpose dropdowns), or
   fold account/settings into the existing `AccountMenu` dropdown instead
   of a third surface. Whichever reduces the number of unrelated jobs one
   dropdown does.
2. **Add an icon per nav link.** `lucide-react` is already a dependency —
   e.g. `Info`/`Users2` for About, `Building2` for Brands (already used
   elsewhere for the intranet link), `Users` for Team, `Newspaper` for
   Blog, `FileText` for Whitepaper, `Mail` for Contact. Small icon in a
   subtle rounded badge to the left of each title, matching Clerk's pattern.
3. **Drop the hairline mosaic for this list specifically.** A single
   surface with normal padding between rows (or at most a very light
   `divide-y`) reads calmer than a line around every cell — this codebase
   already made the same call for the mobile drawer's nav list
   (`MobileNavFab.tsx`, `divide-y divide-rule` instead of the mosaic) in an
   earlier pass; the desktop dropdown never got the same treatment.

The mobile FAB drawer (`MobileNavFab.tsx`) already reasonably separates nav
links from settings from account into distinct sections with dividers
between them — the desktop dropdown should probably converge toward that
same separation rather than staying as one dense block.
