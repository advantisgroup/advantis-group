import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { Elysia, t } from "elysia";
import { Resend } from "resend";

import { api } from "@/../convex/_generated/api";
import { EmailTemplate } from "@/components/email/email-template";

const resend = new Resend(process.env.RESEND_API_KEY);

const convex = process.env.NEXT_PUBLIC_CONVEX_URL
  ? new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  : null;

export const email = new Elysia().post(
  "/send",
  async ({ body, set }) => {
    const {
      firstName,
      lastName,
      adresses,
      cc,
      bcc,
      subject,
      message,
      phone,
      locale,
      topic,
      company,
      submissionType,
      desiredDateTime,
      notes,
      accountEmail,
      accountName,
    } = body;

    const { userId } = await auth();

    try {
      const { data, error } = await resend.emails.send({
        from: `Advantis Group <${process.env.NEXT_PUBLIC_EMAIL_ADRESS}>`,
        to: adresses,
        bcc,
        cc,
        subject,
        react: EmailTemplate({
          firstName,
          lastName,
          message,
          locale,
          subject,
          topic,
        }),
      });

      const status = error ? "failed" : "sent";
      const errorMsg = error
        ? error.message || "Failed to send email"
        : undefined;

      if (convex) {
        try {
          await convex.mutation(api.emails.saveEmail, {
            firstName,
            lastName,
            phone: phone || "",
            email: cc?.[0] || "",
            subject,
            message,
            company: company || "",
            submissionType,
            topic: topic || "",
            desiredDateTime: desiredDateTime || "",
            notes: notes || "",
            accountEmail,
            accountName,
            clerkUserId: userId || "",
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      if (convex) {
        try {
          await convex.mutation(api.emails.saveEmail, {
            firstName,
            lastName,
            email: cc?.[0] || "",
            phone: phone || "",
            subject,
            message,
            company: company || "",
            submissionType,
            topic: topic || "",
            desiredDateTime: desiredDateTime || "",
            notes: notes || "",
            accountEmail,
            accountName,
            clerkUserId: userId || "",
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
      adresses: t.Array(t.String()),
      cc: t.Optional(t.Array(t.String())),
      bcc: t.Optional(t.Array(t.String())),
      subject: t.String(),
      message: t.String(),
      locale: t.Optional(t.String()),
      topic: t.Optional(t.String()),
      company: t.Optional(t.String()),
      submissionType: t.String(),
      desiredDateTime: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      accountEmail: t.String(),
      accountName: t.String(),
    }),
    response: {
      200: t.Object({
        id: t.String(),
      }),
      500: t.Object({
        error: t.String(),
      }),
    },
  }
);
