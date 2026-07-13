---
type: changelog
slug: example-changelog
title: Faster file uploads
summary: Uploads to Files/OneDrive are now up to 3x faster.
audience: all
sendEmail: true
---

We reworked how uploads stream to OneDrive — larger files (including
multi-file drag-and-drop batches) now upload noticeably faster, and the
progress indicator is more accurate.

## What changed

- Uploads are chunked and streamed in parallel instead of sequentially.
- The upload queue keeps working in the background if you switch tabs.
- Failed uploads now retry automatically before surfacing an error.

Publish this example with:

```sh
bun run updates:publish content/updates/example-changelog.md
```
