# Announcements, wiki & guidebooks

Ideas for the knowledge and communication surfaces: announcements, updates,
the internal wiki, and guidebooks.

- **Read-receipt/acknowledgment posts** — require explicit acknowledgment
  for compliance-style announcements, extending the `guidebookReads` pattern
  to `announcements`.
- **Wiki article version history** — a diff view across revisions of a wiki
  entry.
- **Guidebook feedback analytics** — aggregate `guidebookFeedback` and
  `guidebookHighlights` into a "most confusing pages" view for content
  owners.
- **Unified search** — one search surface spanning wiki, guidebooks, and
  updates, exposed through the existing `CommandPalette`.
- **"Related articles" suggestions** — surface related guidebook/wiki pages
  by content similarity. `wiki-chat` (`apps/api/src/routes/wiki-chat.ts`)
  does not actually do this today — it's a fixed system prompt with no
  embedding lookup or retrieval over wiki/guidebook content. Building and
  maintaining an embedding index over `wikiEntries`/guidebook content is a
  prerequisite this item (and the ticket-suggestion item in
  `07_it-tickets-fehlermanagement.md`) would need, not existing
  infrastructure to reuse.
