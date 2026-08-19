import { revalidateTag } from "next/cache";

import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { Elysia } from "elysia";

export const revalidate = new Elysia().post("/revalidate", async ({ request, set }) => {
  const secret = process.env.SANITY_REVALIDATE_SECRET;

  if (!secret) {
    set.status = 500;
    return { error: "SANITY_REVALIDATE_SECRET is not configured." };
  }

  const body = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER_NAME);

  if (!signature || !(await isValidSignature(body, signature, secret))) {
    set.status = 401;
    return { error: "Invalid signature." };
  }

  revalidateTag("post", "max");

  return { revalidated: true };
});
