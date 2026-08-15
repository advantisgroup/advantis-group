# Chat

Ideas for closing the gap between the current chat module and table-stakes
chat features people expect from any internal messaging tool.

- **Message search** — full-text search across conversations (Convex search
  index on `messages`).
- **Pinned messages/conversations** — pin important messages within a
  conversation and pin whole conversations to the top of the list.
- **@mentions with notifications** — route mentions into the existing
  `notifications` system rather than requiring users to watch every channel.
- **Read receipts / typing indicators** — reuse the existing `presence`
  table to show who's seen a message or is currently typing.
- **Inline file/image preview** — hook into the existing
  `attachments`/`file-viewer` components to preview shared files in-thread.
- **Threaded replies** — reply-in-thread instead of a single flat channel
  history.
