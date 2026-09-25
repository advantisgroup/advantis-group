import { api } from "@advantis/convex/api";
import {
  TEAM_TIME_ZONE,
  isWithinCallbackHours,
  zonedLocalToInstant,
} from "@advantis/convex/marketing/inquiry";
import { Elysia, t } from "elysia";

import { type InquiryMailData } from "@/components/email/inquiry-emails";
import { locales } from "@/i18n/request";
import { currentAccount } from "@/lib/account";
import { convex, serverKey } from "@/lib/convex-server";
import { sendReceipt, sendTeamMail } from "@/lib/inquiry-mail";
import { allow, clientIp, limits } from "@/lib/rate-limit";
import { submissionsOpen } from "@/lib/submissions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// a few minutes of grace so a slot picked "now" doesn't bounce off the clock
const PAST_GRACE_MS = 5 * 60 * 1000;

const LIMITS = {
  firstName: 100,
  lastName: 100,
  email: 254,
  phone: 40,
  company: 200,
  subject: 200,
  message: 5000,
  notes: 2000,
} as const;

const submissionTypeSchema = t.Union([
  t.Literal("message"),
  t.Literal("callback"),
  t.Literal("other"),
]);

const topicKeySchema = t.Union([
  t.Literal("withdrawal"),
  t.Literal("question"),
  t.Literal("legal"),
]);

/**
 * A new inquiry. The row is written first (as "queued"), so it exists — with
 * its reference — even if the mail provider then fails; the team mail and the
 * customer's receipt are recorded against it one after the other. A failed
 * team mail can be sent again from the customer's account page.
 */
export const email = new Elysia().post(
  "/send",
  async ({ body, headers, set }) => {
    // the page greys the form out, but that alone never stopped a direct request
    if (!(await submissionsOpen())) {
      set.status = 503;
      return { error: "Submissions are currently closed." };
    }

    if (!(await allow(limits.contactSend, clientIp(headers)))) {
      set.status = 429;
      return { error: "Too many requests. Please try again later." };
    }

    if (!convex) {
      set.status = 500;
      return { error: "Server configuration error." };
    }

    const contactEmail = (body.email ?? body.cc?.[0] ?? "").trim().toLowerCase();
    const timeZone = body.timeZone ?? TEAM_TIME_ZONE;
    const desiredAt =
      body.desiredAt ??
      (body.desiredDateTime ? zonedLocalToInstant(body.desiredDateTime, timeZone) : null) ??
      undefined;
    const fields = { ...body, email: contactEmail };

    const tooLong = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).find(
      (field) => (fields[field]?.length ?? 0) > LIMITS[field],
    );
    const invalid =
      tooLong ??
      (!body.firstName.trim() ? "firstName" : undefined) ??
      (!EMAIL.test(contactEmail) ? "email" : undefined) ??
      (body.submissionType !== "callback" && !body.message.trim() ? "message" : undefined) ??
      (body.submissionType === "callback" && !body.phone?.trim() ? "phone" : undefined);
    if (invalid) {
      set.status = 400;
      return { error: "Invalid field.", field: invalid };
    }
    if (
      body.submissionType === "callback" &&
      (!desiredAt || desiredAt < Date.now() - PAST_GRACE_MS || !isWithinCallbackHours(desiredAt))
    ) {
      set.status = 400;
      return { error: "Pick a time within our callback hours.", field: "dateTime" };
    }

    const account = await currentAccount();
    const locale = (locales as readonly string[]).includes(body.locale ?? "") ? body.locale! : "de";

    const { id, reference } = await convex.mutation(api.marketing.inquiries.createInquiry, {
      serverKey: serverKey(),
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: contactEmail,
      phone: body.phone?.trim() || undefined,
      subject: body.submissionType === "other" ? (body.subject ?? "").trim() : "",
      // a callback's own words are its notes; the old German summary isn't stored any more
      message: body.submissionType === "callback" ? "" : body.message.trim(),
      company: body.company?.trim() || undefined,
      submissionType: body.submissionType,
      topic: body.topic || undefined,
      topicKey: body.topicKey,
      desiredAt: body.submissionType === "callback" ? desiredAt : undefined,
      timeZone: body.submissionType === "callback" ? timeZone : undefined,
      notes: body.notes?.trim() || undefined,
      locale,
      accountEmail: account?.primaryEmail ?? "",
      accountName: account?.name ?? "",
      clerkUserId: account?.clerkUserId ?? "",
    });

    const data: InquiryMailData = {
      id,
      reference,
      submissionType: body.submissionType,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: contactEmail,
      phone: body.phone?.trim() || undefined,
      company: body.company?.trim() || undefined,
      subject: body.subject?.trim() || undefined,
      topic: body.topic || undefined,
      message: body.message.trim(),
      notes: body.notes?.trim() || undefined,
      desiredAt,
      timeZone,
      locale,
      accountEmail: account?.primaryEmail,
    };

    const team = await sendTeamMail(data);
    await convex.mutation(api.marketing.inquiries.markTeamDelivery, {
      serverKey: serverKey(),
      id,
      ...(team.ok
        ? { status: "sent" as const, messageId: team.emailId }
        : { status: "failed" as const, error: team.error, failureReason: team.reason }),
    });
    if (!team.ok) {
      console.error(`[send] team mail for ${reference} failed:`, team.error);
      set.status = 502;
      return { error: "The inquiry could not be delivered.", id, reference };
    }

    // past the cap the team still gets the inquiry, the address just stops getting copies;
    // mailing one of your own verified addresses isn't spam, so that skips the cap
    const ownAddress = account?.emails.includes(contactEmail) ?? false;
    const copySkipReason =
      account?.metadata.inquiryCopies === false
        ? ("preference" as const)
        : !ownAddress && !(await allow(limits.contactCopy, contactEmail))
          ? ("limit" as const)
          : undefined;

    if (copySkipReason) {
      await convex.mutation(api.marketing.inquiries.markReceiptDelivery, {
        serverKey: serverKey(),
        id,
        copyStatus: "skipped",
        copySkipReason,
      });
      return { id, reference, copySent: false, copySkipReason };
    }

    const receipt = await sendReceipt(data, Boolean(account));
    await convex.mutation(api.marketing.inquiries.markReceiptDelivery, {
      serverKey: serverKey(),
      id,
      ...(receipt.ok
        ? { copyStatus: "sent" as const, copyEmailId: receipt.emailId }
        : { copyStatus: "failed" as const, copyFailureReason: receipt.reason }),
    });
    return { id, reference, copySent: receipt.ok };
  },
  {
    body: t.Object({
      firstName: t.String(),
      lastName: t.String(),
      email: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      company: t.Optional(t.String()),
      subject: t.Optional(t.String()),
      message: t.String(),
      locale: t.Optional(t.String()),
      submissionType: submissionTypeSchema,
      topicKey: t.Optional(topicKeySchema),
      /** the translated topic label, kept for the team mail */
      topic: t.Optional(t.String()),
      desiredAt: t.Optional(t.Number()),
      timeZone: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      // legacy fields, accepted so older clients keep working
      desiredDateTime: t.Optional(t.String()),
      addresses: t.Optional(t.Array(t.String())),
      cc: t.Optional(t.Array(t.String())),
      bcc: t.Optional(t.Array(t.String())),
      accountEmail: t.Optional(t.String()),
      accountName: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({
        id: t.String(),
        reference: t.String(),
        copySent: t.Boolean(),
        copySkipReason: t.Optional(t.Union([t.Literal("limit"), t.Literal("preference")])),
      }),
      400: t.Object({ error: t.String(), field: t.String() }),
      429: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
      502: t.Object({ error: t.String(), id: t.String(), reference: t.String() }),
      503: t.Object({ error: t.String() }),
    },
  },
);
