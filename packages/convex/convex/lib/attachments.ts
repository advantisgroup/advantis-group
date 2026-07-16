import { ConvexError } from "convex/values";

/** Combined attachment size ceiling shared by chat messages and announcements. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Throws if the combined size of `attachments` exceeds `MAX_ATTACHMENT_BYTES`. */
export function assertAttachmentSizeOk(attachments: { size?: number }[]): void {
  const totalBytes = attachments.reduce((sum, a) => sum + (a.size ?? 0), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw new ConvexError({
      code: "bad_request",
      message: "Attachments exceed the 5 MB limit",
    });
  }
}
