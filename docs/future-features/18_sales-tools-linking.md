# Sales tools linking

There are three independent sales surfaces with no shared foreign keys
between them, even though they're all describing the same salespeople:
**Performance** (`performanceTopics`, `performanceFlaggedRows`,
`performanceEmployees` — CSV-import-driven KPIs), **Sales Coach EV**
(`salesCoachEvCalls` — AI-scored call coaching), and **Sales Cockpit**
(`salesCockpitProjects`, `salesCockpitFlows`, `salesCockpitLexikon`). This
is the same gap `docs/intranet-management-feature-ideas.md` already names
as the "sales follow-up bridge" — noted here with the concrete schema
evidence for why it's currently impossible to close without new fields.

- **No id links between the three tables at all.** `performanceTopics`
  keys off `performanceEmployees` (itself unlinked to `users` — see
  `14_identity-linking.md`); `salesCoachEvCalls` keys off a raw
  `clerkUserId`; `salesCockpitFlows` has no employee reference in its own
  right. A manager flagging a coaching topic in one tool has no way to
  create a linked action item in another — the earlier doc's suggested fix
  ("create/open follow-up topic" deep links) needs an actual foreign key to
  hang off of, which doesn't exist yet.
- **First slice: route all three through `users`.** Once
  `performanceEmployees.userId` and `salesCoachEvCalls.userId` exist (see
  `14_identity-linking.md`), a "create Sales Coach EV follow-up from this
  Performance topic" action becomes a straightforward two-hop join instead
  of a text-matching guess.
