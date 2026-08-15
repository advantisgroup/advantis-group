# Knowledge content linking

The intranet has grown several independent "write some text, tag it,
publish it" systems, each ported in from its own standalone predecessor
tool and each keeping its own categories/tags. That separation is often the
right call (the schema comments are explicit that Fehlermanagement is
"entirely separate from the guidebooks/wiki system... its own tab, its own
data" on purpose), but search and tagging don't have to be separate for the
ownership to stay separate.

- **Four parallel knowledge-text tables**: `wikiEntries` (general wiki,
  already absorbed the older `guidebookPages` via `wikiMigrationStatus`),
  `salesCockpitLexikon` (sales glossary), and `salesCoachEvWiki` (Sales
  Coach EV's knowledge base) each have their own tagging/category shape and
  no shared index. A person searching for a term has to know which of the
  three tools it might live in.
- **First slice: a unified read-only search index**, not a data migration —
  a Convex search index (or a merged view) spanning `wikiEntries.thema` +
  `tags`, `salesCockpitLexikon`, and `salesCoachEvWiki.title` + `tags`,
  surfaced through the existing `CommandPalette`, so "search everything"
  actually means everything, while each tool keeps authoring, permissions,
  and its own table exactly as-is.
- **Second slice, only if it proves useful**: shared tag vocabulary (reuse
  `wikiCategories`-style rows instead of each tool inventing its own) so a
  tag means the same thing wherever it's used.
