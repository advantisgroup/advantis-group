import { api } from "@advantis/convex/api";
import { currentUser } from "@clerk/nextjs/server";
import { Elysia, t } from "elysia";
import { Resend } from "resend";

import { EmailTemplate } from "@/components/email/email-template";
import { convex, serverKey } from "@/lib/convex-server";
import { allow, clientIp, limits } from "@/lib/rate-limit";

const resend = new Resend(process.env.RESEND_API_KEY);

const submissionTypeSchema = t.Union([
  t.Literal("message"),
  t.Literal("callback"),
  t.Literal("other"),
]);

export const email = new Elysia().post(
  "/send",
  async ({ body, headers, set }) => {
    // the page greys the form out, but that alone never stopped a direct request
    if (process.env.NEXT_PUBLIC_ALLOW_SUBMISSIONS !== "true") {
      set.status = 503;
      return { error: "Submissions are currently closed." };
    }

    if (!(await allow(limits.contactSend, clientIp(headers)))) {
      set.status = 429;
      return { error: "Too many requests. Please try again later." };
    }

    const {
      firstName,
      lastName,
      cc,
      subject,
      message,
      phone,
      locale,
      topic,
      company,
      submissionType,
      desiredDateTime,
      notes,
    } = body;

    // Recipient and account come from the server, never the request: older
    // clients still send `addresses`/`accountEmail`, they're just ignored now.
    const inbox = process.env.NEXT_PUBLIC_EMAIL_ADRESS!;
    const contactEmail = (body.email ?? cc?.[0] ?? "").trim();
    const user = await currentUser();
    const userId = user?.id ?? "";
    const accountEmail = user?.primaryEmailAddress?.emailAddress.toLowerCase() ?? "";
    const accountName = user?.fullName ?? "";
    // past the cap the team still gets the inquiry, the address just stops getting copies
    const sendCopy = contactEmail !== "" && (await allow(limits.contactCopy, contactEmail));

    try {
      const { data, error } = await resend.emails.send({
        from: `ADVANTIS GROUP <${inbox}>`,
        to: [inbox],
        cc: sendCopy ? [contactEmail] : undefined,
        replyTo: contactEmail || undefined,
        subject,
        react: EmailTemplate({
          firstName,
          lastName,
          email: contactEmail,
          phone,
          company,
          message,
          locale,
          subject,
          topic,
          submissionType,
        }),
      });

      const status = error ? "failed" : "sent";
      const errorMsg = error ? error.message || "Failed to send email" : undefined;

      if (convex) {
        try {
          await convex.mutation(api.marketing.emails.saveEmail, {
            serverKey: serverKey(),
            firstName,
            lastName,
            phone: phone || undefined,
            email: contactEmail,
            subject,
            message,
            company: company || undefined,
            submissionType,
            topic: topic || undefined,
            desiredDateTime: desiredDateTime || undefined,
            notes: notes || undefined,
            accountEmail,
            accountName,
            clerkUserId: userId,
            status,
            error: errorMsg,
            messageId: data?.id,
          });
        } catch (convexError) {
          console.error("Failed to save email log to Convex:", convexError);
        }
      }

      if (error) {
        set.status = 500;
        return {
          error: error.message || "Failed to send email",
        };
      }
      if (!data || !data.id) {
        set.status = 500;
        return {
          error: "Email not sent - no response data",
        };
      }
      return {
        id: data.id,
      };
    } catch (error) {
      set.status = 500;
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      if (convex) {
        try {
          await convex.mutation(api.marketing.emails.saveEmail, {
            serverKey: serverKey(),
            firstName,
            lastName,
            email: contactEmail,
            phone: phone || undefined,
            subject,
            message,
            company: company || undefined,
            submissionType,
            topic: topic || undefined,
            desiredDateTime: desiredDateTime || undefined,
            notes: notes || undefined,
            accountEmail,
            accountName,
            clerkUserId: userId,
            status: "failed",
            error: errorMessage,
          });
        } catch (convexError) {
          console.error("Failed to save email log to Convex:", convexError);
        }
      }

      return {
        error: errorMessage,
      };
    }
  },
  {
    body: t.Object({
      firstName: t.String(),
      lastName: t.String(),
      phone: t.Optional(t.String()),
      email: t.Optional(t.String()),
      // legacy fields, accepted so older clients keep working
      addresses: t.Optional(t.Array(t.String())),
      cc: t.Optional(t.Array(t.String())),
      bcc: t.Optional(t.Array(t.String())),
      subject: t.String(),
      message: t.String(),
      locale: t.Optional(t.String()),
      topic: t.Optional(t.String()),
      company: t.Optional(t.String()),
      submissionType: submissionTypeSchema,
      desiredDateTime: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      accountEmail: t.Optional(t.String()),
      accountName: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({
        id: t.String(),
      }),
      429: t.Object({
        error: t.String(),
      }),
      500: t.Object({
        error: t.String(),
      }),
      503: t.Object({
        error: t.String(),
      }),
    },
  },
);
