import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { referenceOf } from "@advantis/convex/marketing/inquiry";
import { ConvexError } from "convex/values";
import { Elysia, t } from "elysia";

import { type InquiryMailData } from "@/components/email/inquiry-emails";
import { convexAccount, currentAccount } from "@/lib/account";
import { convex, serverKey } from "@/lib/convex-server";
import { sendTeamMail } from "@/lib/inquiry-mail";
import { allow, limits } from "@/lib/rate-limit";
import { submissionsOpen } from "@/lib/submissions";

const attachmentSchema = t.Object({
  storageId: t.String(),
  kind: t.Union([t.Literal("image"), t.Literal("file")]),
  name: t.String({ maxLength: 200 }),
  size: t.Optional(t.Number()),
  contentType: t.Optional(t.String()),
});

const errorCode = (error: unknown) =>
  error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;

const toMailData = (row: Doc<"emails">): InquiryMailData => ({
  id: row._id,
  reference: referenceOf(row),
  submissionType: row.submissionType,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  company: row.company,
  subject: row.subject || undefined,
  topic: row.topic,
  message: row.message,
  notes: row.notes,
  desiredAt: row.desiredAt,
  timeZone: row.timeZone,
  locale: row.locale ?? "de",
  accountEmail: row.accountEmail || undefined,
});

/**
 * The signed-in customer's own inquiries — `/account/submissions` and the
 * page for one inquiry. Who the caller is comes from Clerk on the server;
 * Convex checks every row belongs to one of their verified addresses.
 */
export const submissions = new Elysia({ prefix: "/submissions" })
  .resolve(async () => ({ account: await currentAccount() }))
  .onBeforeHandle(({ account, set }) => {
    if (!account) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    if (!convex) {
      set.status = 500;
      return { error: "Server configuration error." };
    }
  })
  .get(
    "/",
    async ({ account, query }) =>
      await convex!.query(api.marketing.inquiries.listForAccount, {
        serverKey: serverKey(),
        account: convexAccount(account!),
        limit: query.limit,
      }),
    { query: t.Object({ limit: t.Optional(t.Numeric()) }) },
  )
  .get("/:id", async ({ account, params, set }) => {
    const detail = await convex!.query(api.marketing.inquiries.getForAccount, {
      serverKey: serverKey(),
      account: convexAccount(account!),
      id: params.id,
    });
    if (!detail) {
      set.status = 404;
      return { error: "Not found" };
    }
    return detail;
  })
  .post("/:id/retry", async ({ account, params, set }) => {
    if (!(await allow(limits.inquiryRetry, params.id))) {
      set.status = 429;
      return { error: "Too many attempts. Please try again later." };
    }
    if (!(await submissionsOpen())) {
      set.status = 503;
      return { error: "Submissions are currently closed." };
    }
    const row = await convex!.query(api.marketing.inquiries.getOwnedRow, {
      serverKey: serverKey(),
      account: convexAccount(account!),
      id: params.id,
    });
    if (!row) {
      set.status = 404;
      return { error: "Not found" };
    }
    if (row.status !== "failed") return { status: row.status };

    const team = await sendTeamMail(toMailData(row));
    await convex!.mutation(api.marketing.inquiries.markTeamDelivery, {
      serverKey: serverKey(),
      id: row._id,
      ...(team.ok
        ? { status: "sent" as const, messageId: team.emailId }
        : { status: "failed" as const, error: team.error, failureReason: team.reason }),
    });
    return team.ok
      ? { status: "sent" as const }
      : { status: "failed" as const, failureReason: team.reason };
  })
  .post(
    "/:id/state",
    async ({ account, params, body, set }) => {
      if (!(await allow(limits.inquiryWrite, account!.clerkUserId))) {
        set.status = 429;
        return { error: "Too many requests." };
      }
      try {
        return await convex!.mutation(api.marketing.inquiries.setStateByCustomer, {
          serverKey: serverKey(),
          account: convexAccount(account!),
          id: params.id,
          action: body.action,
          note: body.note,
        });
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;
        set.status = code === "not_found" ? 404 : 409;
        return { error: code };
      }
    },
    {
      body: t.Object({
        action: t.Union([t.Literal("withdraw"), t.Literal("resolve"), t.Literal("reopen")]),
        note: t.Optional(t.String({ maxLength: 5000 })),
      }),
    },
  )
  .post(
    "/:id/rating",
    async ({ account, params, body, set }) => {
      if (!(await allow(limits.inquiryWrite, account!.clerkUserId))) {
        set.status = 429;
        return { error: "Too many requests." };
      }
      try {
        return await convex!.mutation(api.marketing.inquiries.rateByCustomer, {
          serverKey: serverKey(),
          account: convexAccount(account!),
          id: params.id,
          rating: body.rating,
          comment: body.comment,
        });
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;
        set.status = code === "not_found" ? 404 : 409;
        return { error: code };
      }
    },
    {
      body: t.Object({
        rating: t.Union([t.Literal("helpful"), t.Literal("not_helpful")]),
        comment: t.Optional(t.String({ maxLength: 2000 })),
      }),
    },
  )
  .post(
    "/:id/messages",
    async ({ account, params, body, set }) => {
      if (!(await allow(limits.inquiryWrite, account!.clerkUserId))) {
        set.status = 429;
        return { error: "Too many requests." };
      }
      try {
        await convex!.mutation(api.marketing.inquiries.addCustomerMessage, {
          serverKey: serverKey(),
          account: convexAccount(account!),
          id: params.id,
          body: body.body,
          attachments: body.attachments?.map((attachment) => ({
            ...attachment,
            storageId: attachment.storageId as Id<"_storage">,
          })),
        });
        return { ok: true };
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;
        set.status = code === "not_found" ? 404 : 400;
        return { error: code };
      }
    },
    {
      body: t.Object({
        body: t.String({ maxLength: 5000 }),
        attachments: t.Optional(t.Array(attachmentSchema, { maxItems: 3 })),
      }),
    },
  )
  .post("/upload-url", async ({ account, set }) => {
    if (!(await allow(limits.inquiryUpload, account!.clerkUserId))) {
      set.status = 429;
      return { error: "Too many uploads." };
    }
    const url = await convex!.mutation(api.marketing.inquiries.generateUploadUrl, {
      serverKey: serverKey(),
    });
    return { url };
  })
  .get("/:id/attachments/:storageId", async ({ account, params, set }) => {
    const url = await convex!.query(api.marketing.inquiries.attachmentUrlForAccount, {
      serverKey: serverKey(),
      account: convexAccount(account!),
      id: params.id,
      storageId: params.storageId,
    });
    if (!url) {
      set.status = 404;
      return { error: "Not found" };
    }
    return new Response(null, { status: 302, headers: { Location: url } });
  });
