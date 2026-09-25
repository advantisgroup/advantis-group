import { api } from "@advantis/convex/api";
import { auth, clerkClient, reverificationError } from "@clerk/nextjs/server";
import { Elysia, t } from "elysia";
import { Resend } from "resend";

import { convexAccount, currentAccount } from "@/lib/account";
import { convex, serverKey } from "@/lib/convex-server";
import { allow, limits } from "@/lib/rate-limit";
import { WHITEPAPER_FILENAME, readWhitepaper } from "@/lib/whitepaper";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * The signed-in customer's own data: consents, a copy of everything, and
 * erasing it. Who they are comes from Clerk on the server.
 */
export const account = new Elysia({ prefix: "/account" })
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
  .get("/consents", async ({ account }) => {
    const [consents, staff] = await Promise.all([
      convex!.query(api.marketing.account.consentsForAccount, {
        serverKey: serverKey(),
        account: convexAccount(account!),
      }),
      convex!.query(api.marketing.account.isStaff, {
        serverKey: serverKey(),
        clerkUserId: account!.clerkUserId,
      }),
    ]);
    return { ...consents, primaryEmail: account!.primaryEmail, staff };
  })
  .get("/export", async ({ account, set }) => {
    if (!(await allow(limits.accountExport, account!.clerkUserId))) {
      set.status = 429;
      return { error: "Too many requests." };
    }
    const { user } = account!;
    const data = await convex!.query(api.marketing.account.exportForAccount, {
      serverKey: serverKey(),
      account: convexAccount(account!),
    });
    const body = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        emailAddresses: user.emailAddresses.map((address) => ({
          email: address.emailAddress,
          verified: address.verification?.status === "verified",
        })),
        phoneNumbers: user.phoneNumbers.map((phone) => phone.phoneNumber),
        connectedAccounts: user.externalAccounts.map((external) => external.provider),
        details: user.unsafeMetadata,
        createdAt: new Date(user.createdAt).toISOString(),
        lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
      },
      ...data,
    };
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="advantis-data_${date}.json"`,
      },
    });
  })
  .delete("/inquiries", async ({ account }) =>
    convex!.mutation(api.marketing.account.eraseInquiryHistory, {
      serverKey: serverKey(),
      account: convexAccount(account!),
    }),
  )
  /**
   * Deletes the account and everything the marketing site holds on it. Behind
   * Clerk re-verification (the page wraps the call in `useReverification`).
   * Staff are refused: their Clerk user is their intranet identity, and
   * deleting it would remove them from the intranet.
   */
  .post("/delete", async ({ account, set }) => {
    const { has } = await auth();
    if (!has({ reverification: "strict" })) {
      set.status = 403;
      return reverificationError("strict");
    }
    const staff = await convex!.query(api.marketing.account.isStaff, {
      serverKey: serverKey(),
      clerkUserId: account!.clerkUserId,
    });
    if (staff) {
      set.status = 403;
      return { error: "staff" };
    }
    await convex!.mutation(api.marketing.account.eraseForAccount, {
      serverKey: serverKey(),
      account: convexAccount(account!),
    });
    await (await clerkClient()).users.deleteUser(account!.clerkUserId);
    return { ok: true };
  })
  .post(
    "/consents/whitepaper/withdraw",
    async ({ account, body, set }) => {
      const lead = await convex!.mutation(api.marketing.account.withdrawWhitepaperConsent, {
        serverKey: serverKey(),
        account: convexAccount(account!),
        email: body.email.toLowerCase(),
      });
      if (!lead) {
        set.status = 404;
        return { error: "Not found" };
      }
      // the lead already reached the team inbox as a mail, so they need to hear it's off
      await resend.emails.send({
        from: `ADVANTIS GROUP Website <${process.env.NEXT_PUBLIC_EMAIL_ADRESS}>`,
        to: [process.env.NEXT_PUBLIC_EMAIL_ADRESS!],
        subject: `Whitepaper-Lead widerrufen: ${lead.firstName} ${lead.lastName} (${lead.company})`,
        text: [
          "Eine Einwilligung aus dem Whitepaper-Download wurde im Kundenkonto widerrufen.",
          "Bitte diese Person nicht mehr zu diesem Zweck kontaktieren.",
          "",
          `Firma:   ${lead.company}`,
          `Name:    ${lead.firstName} ${lead.lastName}`,
          `E-Mail:  ${body.email.toLowerCase()}`,
        ].join("\n"),
      });
      return { ok: true };
    },
    { body: t.Object({ email: t.String({ format: "email" }) }) },
  )
  .get("/downloads/whitepaper", async ({ account, set }) => {
    const { whitepaper } = await convex!.query(api.marketing.account.consentsForAccount, {
      serverKey: serverKey(),
      account: convexAccount(account!),
    });
    if (!whitepaper.some((lead) => lead.status === "confirmed")) {
      set.status = 404;
      return { error: "Not found" };
    }
    return new Response(new Uint8Array(await readWhitepaper()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${WHITEPAPER_FILENAME}"`,
      },
    });
  });
